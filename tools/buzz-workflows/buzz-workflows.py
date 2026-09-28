#!/usr/bin/env python3
"""Idempotent Buzz reaction gates. Uses the caller's CLI identity, never another key."""
import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

OWNER = '9fb347496dfa2e34883b2ebe8156af2cca564b5208242921feb9d4b317b32dc0'
PUN_LEAD = '9e9d4068369acfe6e71d22ba6559abb21d53312872b918a97b98f3c41f7eff2a'
MAC_LEAD = 'f275816f3941f930b0ac318f427c973f77fd9a5eb8c8ab00157e47de491498da'
LEAD = '리더(푼)'
PREFIX = 'buzz-gates/'
ERROR_EXITS = {'archived': 10, 'forbidden': 11, 'channel_not_found': 12,
               'workflow_not_found': 13, 'failed': 1}
GATES = {
    'approval': [('approve', '✅', '승인: 원문 태스크를 확인하고 배정·진행 상태를 갱신해 주세요.'),
                 ('rework', '🔁', '재작업: 원문과 진스의 요구를 확인하고 담당자에게 수정 배정해 주세요.')],
    'work': [('review', '🔍', '리뷰 요청: 원문의 PR·산출물·검증 근거를 확인하고 리뷰를 진행해 주세요.'),
             ('release', '🚀', '운영 반영: 이 반응은 승인 자체가 아닙니다. 리뷰·검증 통과 여부와 적용 순서를 확인한 뒤 운영에 반영해 주세요.'),
             ('done', '🏁', '완료: 이 반응은 승인 자체가 아닙니다. 결과·산출물·검증을 태스크에 기록하고 resolved 후 워크플로와 작업 채널을 삭제해 주세요.')],
}


class BuzzError(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def error_code(stderr):
    """Only emit a fixed code, never relay text or signed request headers."""
    permission_reasons = ('actor not authorized', 'forbidden', 'not the owner',
                          'permission denied')
    try:
        error = json.loads(stderr)
    except (ValueError, TypeError):
        error = None
    message = (str(error.get('message', '')) if isinstance(error, dict)
               else str(stderr or '')).lower()
    # Older CLI builds and some transport failures do not use the documented JSON
    # category, but the watcher still has to stop and escalate explicit denials.
    if any(reason in message for reason in permission_reasons):
        return 'forbidden'
    if not isinstance(error, dict) or error.get('error') not in ('relay_error', 'auth_error'):
        return 'failed'
    if 'channel is archived' in message:
        return 'archived'
    if 'channel not found' in message:
        return 'channel_not_found'
    if 'workflow not found' in message:
        return 'workflow_not_found'
    return 'failed'


def buzz(*args, content=None):
    result = subprocess.run([os.environ.get('BUZZ_BIN', 'buzz'), *args], input=content,
                            capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise BuzzError(error_code(result.stderr))
    data = json.loads(result.stdout)
    if isinstance(data, dict) and data.get('accepted') is False:
        raise RuntimeError(f'Buzz {" ".join(args[:2])} rejected')
    return data


def definitions(profile, leader=LEAD, review_leader=None, test=None):
    if any(c in name for name in (leader, review_leader or leader) for c in '\r\n@{}'):
        raise ValueError('leader must be a literal display name')
    out = {}
    for key, emoji, instruction in GATES[profile]:
        name = PREFIX + profile + '/' + key
        target = review_leader if key == 'review' and review_leader else leader
        trigger = {'on': 'reaction_added', 'emoji': emoji}
        if profile == 'approval':
            trigger['filter'] = f'trigger_author == "{OWNER}"'
        elif key == 'review':
            trigger['filter'] = '(' + ' || '.join(
                f'trigger_author == "{author}"' for author in (OWNER, PUN_LEAD)) + ')'
        elif profile == 'work':
            trigger['filter'] = '(' + ' || '.join(
                f'trigger_author == "{author}"' for author in (OWNER, PUN_LEAD, MAC_LEAD)) + ')'
        text = f'@{target} [{emoji} {name}] {instruction} 원문: {{{{trigger.message_id}}}}'
        if test:
            scope = f'trigger_message_id == "{test}"'
            trigger['filter'] = (f'{trigger["filter"]} && {scope}'
                                 if 'filter' in trigger else scope)
            text = f'@{target} [W2 검증 {emoji}] 수신한 반응과 원문 ID만 이 스레드에 기록해 주세요. 검증 글이므로 배포·태스크 종료·채널 삭제는 실행하지 않습니다. 원문: {{{{trigger.message_id}}}}'
        out[name] = {'name': name, 'trigger': trigger,
                     'steps': [{'id': key, 'action': 'send_message',
                                'reply_in_thread': True, 'text': text}]}
    return out


def managed(channel, profile):
    rows = buzz('workflows', 'list', '--channel', channel)
    if not isinstance(rows, list):
        raise RuntimeError('invalid workflow list')
    expected_names = {PREFIX + profile + '/' + key for key, _, _ in GATES[profile]}
    retired_names = ({PREFIX + 'work/review-disabled': PREFIX + 'work/review'}
                     if profile == 'work' else {})
    result = {}
    for row in rows:
        try:
            definition = json.loads(row['content'])
        except (ValueError, KeyError, TypeError):
            # Other workflows may use block YAML. These are not ours.
            continue
        name = definition.get('name', '') if isinstance(definition, dict) else ''
        canonical_name = retired_names.get(name, name)
        if canonical_name in expected_names:
            if canonical_name in result:
                raise RuntimeError(f'duplicate managed workflow: {canonical_name}; reconcile manually')
            result[canonical_name] = (row['workflow_id'], definition)
    return result


def state_path(channel, suffix):
    relay = os.environ.get('BUZZ_RELAY_URL', 'http://localhost:3000')
    key = hashlib.sha256((relay + '/' + channel).encode()).hexdigest()
    home = Path(os.environ.get('BUZZ_HOME', str(Path.home() / '.buzz')))
    directory = home / 'var/workflows/gates-locks'
    directory.mkdir(parents=True, exist_ok=True)
    return directory / (key + suffix)


@contextmanager
def locked(channel):
    with state_path(channel, '.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def ensure(channel, profile, leader=LEAD, review_leader=None, test=None):
    # Check access before interpreting an empty list as an unconfigured channel.
    if not buzz('channels', 'get', '--channel', channel):
        raise RuntimeError('channel unavailable to current identity')
    for target in set([leader, review_leader or leader]):
        users = buzz('users', 'get', '--name', target)
        members = {m['pubkey'] for m in buzz('channels', 'members', '--channel', channel)}
        hits = [u for u in users if u.get('display_name') == target and u['pubkey'] in members]
        if len(hits) != 1:
            raise RuntimeError(f'exactly one channel member must be named {target}')
    wanted = definitions(profile, leader, review_leader, test)
    with locked(channel):
        existing = managed(channel, profile)
        for name, definition in wanted.items():
            yaml = json.dumps(definition, ensure_ascii=False, indent=2)  # JSON is YAML 1.2.
            if name not in existing:
                buzz('workflows', 'create', '--channel', channel, '--yaml', '-', content=yaml)
            else:
                # Definition events survive engine deletion. Re-upsert even when
                # the event body matches, preserving IDs without trusting list as liveness.
                buzz('workflows', 'update', '--channel', channel, '--workflow', existing[name][0],
                     '--yaml', '-', content=yaml)
        actual = managed(channel, profile)
        if set(actual) != set(wanted) or any(actual[n][1] != d for n, d in wanted.items()):
            raise RuntimeError('workflow readback mismatch')
    return {name: actual[name][0] for name in wanted}


def remove(channel, profile='work', close=False, archive_unmanaged=False):
    with locked(channel):
        existing = managed(channel, profile)
        pending = state_path(channel, '.closing')
        if close and archive_unmanaged and not existing and not pending.exists():
            buzz('channels', 'archive', '--channel', channel)
            return {'channel': channel, 'deleted_workflows': 0, 'closed': False, 'archived': True}
        if close:
            # Remember intent if workflow cleanup succeeds but channel deletion fails.
            pending.touch()
        for workflow, definition in existing.values():
            # A successful delete response confirms event publication, not that the
            # engine applied it. Rename and disable first, then verify by readback.
            inert = dict(definition, name=f'{definition["name"]}-disabled-{workflow}',
                          steps=[{'id': 'cleanup_probe', 'action': 'send_message',
                                  'if': 'false', 'text': 'cleanup probe'}])
            buzz('workflows', 'update', '--channel', channel, '--workflow', workflow,
                 '--yaml', '-', content=json.dumps(inert, ensure_ascii=False))
            buzz('workflows', 'delete', '--workflow', workflow)
        if managed(channel, profile):
            raise RuntimeError('workflow disablement not confirmed by readback; channel retained')
        if close:
            buzz('channels', 'delete', '--channel', channel)
            pending.unlink(missing_ok=True)
    return {'channel': channel, 'deleted_workflows': len(existing), 'closed': close}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['ensure', 'remove', 'close'])
    parser.add_argument('--channel', required=True, type=lambda v: str(uuid.UUID(v)))
    parser.add_argument('--profile', choices=GATES, default='work')
    parser.add_argument('--leader', default=LEAD)
    parser.add_argument('--review-leader')
    parser.add_argument('--test', metavar='MESSAGE_ID', help='isolate safe wake-up checks to this message')
    parser.add_argument('--archive-unmanaged', action='store_true',
                        help='close: preserve legacy archive policy for channels without managed gates')
    args = parser.parse_args()
    if args.test and (len(args.test) != 64 or any(c not in '0123456789abcdef' for c in args.test)):
        parser.error('--test requires a 64-character event ID')
    if args.test and args.profile != 'work':
        parser.error('--test is only for work gates')
    if args.archive_unmanaged and args.action != 'close':
        parser.error('--archive-unmanaged requires close')
    if args.action == 'ensure':
        result = ensure(args.channel, args.profile, args.leader, args.review_leader, args.test)
    else:
        result = remove(args.channel, args.profile, args.action == 'close', args.archive_unmanaged)
    print(json.dumps(result, ensure_ascii=False))


def run_cli():
    try:
        main()
        return 0
    except BuzzError as exc:
        print(f'WORKFLOW_GATES_ERROR {exc.code}', file=sys.stderr)
        return ERROR_EXITS[exc.code]
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
        print('WORKFLOW_GATES_ERROR failed', file=sys.stderr)
        return ERROR_EXITS['failed']


if __name__ == '__main__':
    sys.exit(run_cli())
