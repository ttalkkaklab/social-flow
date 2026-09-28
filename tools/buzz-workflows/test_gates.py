import copy
from contextlib import redirect_stderr
import io
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gates = module('gates', ROOT / 'buzz-workflows.py')
installer = module('installer', ROOT / 'install.py')


class Relay:
    def __init__(self):
        self.rows = []
        self.calls = []
        self.fail = None
        self.visible = True
        self.ambiguous = False
        self.serial = 0
        self.retain_deleted = False
        self.ignore_updates = False

    def __call__(self, *args, content=None):
        self.calls.append(args)
        op = args[:2]
        if op == self.fail:
            raise RuntimeError('injected failure')
        if op == ('channels', 'get'):
            return {'channel_id': 'test'} if self.visible else None
        if op == ('users', 'get'):
            return [{'pubkey': key, 'display_name': args[-1]}
                    for key in (['leader', 'duplicate'] if self.ambiguous else ['leader'])]
        if op == ('channels', 'members'):
            return [{'pubkey': 'leader'}, {'pubkey': 'duplicate'}]
        if op == ('workflows', 'list'):
            return copy.deepcopy(self.rows)
        if op == ('workflows', 'create'):
            self.serial += 1
            self.rows.append({'workflow_id': str(self.serial), 'content': content})
        if op == ('workflows', 'update'):
            if not self.ignore_updates:
                next(r for r in self.rows if r['workflow_id'] == args[5])['content'] = content
        if op == ('workflows', 'delete'):
            if not self.retain_deleted:
                self.rows = [r for r in self.rows if r['workflow_id'] != args[-1]]
        return {'accepted': True}


class GatesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {'BUZZ_HOME': self.temp.name, 'BUZZ_RELAY_URL': 'https://test'})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.relay = Relay()
        self.mock = patch.object(gates, 'buzz', self.relay)
        self.mock.start()
        self.addCleanup(self.mock.stop)

    def test_retry_does_not_duplicate_and_updates_keep_ids(self):
        first = gates.ensure('channel', 'work')
        self.assertEqual(first, gates.ensure('channel', 'work'))
        self.assertEqual(first, gates.ensure('channel', 'work', review_leader='Other Leader'))
        self.assertEqual(3, sum(c[:2] == ('workflows', 'create') for c in self.relay.calls))
        self.assertEqual(6, sum(c[:2] == ('workflows', 'update') for c in self.relay.calls))

    def test_retry_completes_partial_registration(self):
        definitions = gates.definitions('work')
        self.relay.rows.append({'workflow_id': 'partial', 'content': json.dumps(next(iter(definitions.values())))})
        result = gates.ensure('channel', 'work')
        self.assertEqual(result['buzz-gates/work/review'], 'partial')
        self.assertEqual(len(self.relay.rows), 3)

    def test_disabled_retired_gate_is_safely_replaced_in_place(self):
        retired = {'name': 'buzz-gates/work/review-disabled',
                   'trigger': {'on': 'reaction_added', 'emoji': '👀',
                               'filter': 'trigger_message_id == "' + '0' * 64 + '"'},
                   'steps': [{'id': 'noop', 'action': 'send_message',
                              'if': 'false', 'text': 'disabled'}]}
        self.relay.rows.append({'workflow_id': 'retired', 'content': json.dumps(retired)})
        result = gates.ensure('channel', 'work')
        self.assertEqual(set(result), set(gates.definitions('work')))
        self.assertEqual(result['buzz-gates/work/review'], 'retired')
        self.assertEqual(len(self.relay.rows), 3)

    def test_invisible_channel_never_creates(self):
        self.relay.visible = False
        with self.assertRaisesRegex(RuntimeError, 'unavailable'):
            gates.ensure('channel', 'work')
        self.assertFalse(self.relay.rows)

    def test_ambiguous_mention_never_creates(self):
        self.relay.ambiguous = True
        with self.assertRaisesRegex(RuntimeError, 'exactly one'):
            gates.ensure('channel', 'work')
        self.assertFalse(self.relay.rows)

    def test_duplicate_registry_stops_without_mutation(self):
        gates.ensure('channel', 'work')
        self.relay.rows.append(copy.deepcopy(self.relay.rows[0]))
        with self.assertRaisesRegex(RuntimeError, 'duplicate'):
            gates.remove('channel', close=True)
        self.assertFalse(any(c[:2] == ('channels', 'delete') for c in self.relay.calls))

    def test_delete_failure_retains_channel(self):
        gates.ensure('channel', 'work')
        self.relay.fail = ('workflows', 'delete')
        with self.assertRaises(RuntimeError):
            gates.remove('channel', close=True)
        self.assertFalse(any(c[:2] == ('channels', 'delete') for c in self.relay.calls))

    def test_channel_delete_retry_does_not_archive_after_gates_are_gone(self):
        gates.ensure('channel', 'work')
        self.relay.fail = ('channels', 'delete')
        with self.assertRaises(RuntimeError):
            gates.remove('channel', close=True, archive_unmanaged=True)
        self.assertEqual(self.relay.rows, [])
        self.relay.fail = None
        self.assertTrue(gates.remove('channel', close=True, archive_unmanaged=True)['closed'])
        self.assertFalse(any(c[:2] == ('channels', 'archive') for c in self.relay.calls))
        self.assertFalse(gates.state_path('channel', '.closing').exists())

    def test_remove_keeps_unrelated_workflows_and_channel(self):
        gates.ensure('channel', 'work')
        foreign = {'workflow_id': 'foreign', 'content': 'name: foreign\n'}
        self.relay.rows.append(foreign)
        gates.remove('channel')
        self.assertEqual(self.relay.rows, [foreign])
        self.assertFalse(any(c[:2] == ('channels', 'delete') for c in self.relay.calls))

    def test_unmanaged_watcher_channel_retains_legacy_archive(self):
        self.assertTrue(gates.remove('channel', close=True, archive_unmanaged=True)['archived'])
        self.assertFalse(any(c[:2] == ('channels', 'delete') for c in self.relay.calls))

    def test_workflow_list_error_never_closes(self):
        self.relay.fail = ('workflows', 'list')
        with self.assertRaises(RuntimeError):
            gates.remove('channel', close=True, archive_unmanaged=True)
        self.assertFalse(any(c[:2] in [('channels', 'delete'), ('channels', 'archive')] for c in self.relay.calls))

    def test_cleanup_separates_retained_records_from_runnable_gates(self):
        gates.ensure('channel', 'work')
        self.relay.retain_deleted = True
        result = gates.remove('channel')
        operations = [c[:2] for c in self.relay.calls]
        self.assertLess(operations.index(('workflows', 'update')), operations.index(('workflows', 'delete')))
        self.assertEqual(result['deleted_workflows'], 3)
        self.assertEqual(len(self.relay.rows), 3)
        for row in self.relay.rows:
            definition = json.loads(row['content'])
            self.assertIn('-disabled-', definition['name'])
            self.assertEqual(definition['steps'][0]['if'], 'false')
        self.assertEqual(gates.managed('channel', 'work'), {})

    def test_cleanup_readback_failure_retains_channel(self):
        gates.ensure('channel', 'work')
        self.relay.retain_deleted = True
        self.relay.ignore_updates = True
        with self.assertRaisesRegex(RuntimeError, 'disablement not confirmed'):
            gates.remove('channel', close=True)
        operations = [c[:2] for c in self.relay.calls]
        self.assertNotIn(('channels', 'delete'), operations)

    def test_owner_and_work_action_filters_and_safe_test_scope(self):
        for definition in gates.definitions('approval').values():
            self.assertEqual(definition['trigger']['filter'], f'trigger_author == "{gates.OWNER}"')
        work = gates.definitions('work')
        review = work['buzz-gates/work/review']
        self.assertEqual(review['trigger']['emoji'], '🔍')
        allowed = (gates.OWNER, gates.PUN_LEAD, gates.MAC_LEAD)
        for name in ('release', 'done'):
            definition = work[f'buzz-gates/work/{name}']
            self.assertTrue(all(author in definition['trigger']['filter'] for author in allowed))
        self.assertTrue(all(author in review['trigger']['filter']
                            for author in (gates.OWNER, gates.PUN_LEAD)))
        self.assertNotIn(gates.MAC_LEAD, review['trigger']['filter'])
        for name in ('release', 'done'):
            self.assertIn('반응은 승인 자체가 아닙니다',
                          work[f'buzz-gates/work/{name}']['steps'][0]['text'])
        self.assertTrue(all('filter' in definition['trigger'] for definition in work.values()))
        all_gates = [definition for profile in gates.GATES
                     for definition in gates.definitions(profile).values()]
        self.assertFalse(any(definition['trigger']['emoji'] in ('👀', '💬')
                             for definition in all_gates))
        scoped = gates.definitions('work', test='a' * 64)
        self.assertIn('trigger_author', scoped['buzz-gates/work/review']['trigger']['filter'])
        for definition in scoped.values():
            self.assertIn('a' * 64, definition['trigger']['filter'])
            self.assertIn('실행하지 않습니다', definition['steps'][0]['text'])
        for name in ('release', 'done'):
            self.assertTrue(all(author in scoped[f'buzz-gates/work/{name}']['trigger']['filter']
                                for author in allowed))
        self.assertNotIn(gates.MAC_LEAD,
                         scoped['buzz-gates/work/review']['trigger']['filter'])

    def test_eyes_on_gate_messages_cannot_retrigger_review(self):
        review = gates.definitions('work')['buzz-gates/work/review']['trigger']
        # Workflow messages receive automatic read markers from both leaders.
        # The review gate uses a distinct emoji, so any number of those markers
        # fail before the author filter and cannot create another gate message.
        for automatic_emoji in ('👀', '💬'):
            for _ in range(3):
                self.assertNotEqual(review['emoji'], automatic_emoji)


class WatcherErrorTests(unittest.TestCase):
    def invoke_close_and_watcher(self, error):
        from types import SimpleNamespace
        real = module('watcher_error_gates', ROOT / 'buzz-workflows.py')
        calls = []

        def cli(*args, **kwargs):
            command = args[0]
            calls.append(command)
            if command[1:3] == ['workflows', 'list']:
                return SimpleNamespace(returncode=0, stdout='[]', stderr='')
            self.assertEqual(command[1:3], ['channels', 'archive'])
            return SimpleNamespace(returncode=2, stdout='', stderr=json.dumps(error))

        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, {'BUZZ_HOME': tmp}):
            argv = ['buzz-workflows.py', 'close', '--channel',
                    '11111111-1111-1111-1111-111111111111', '--archive-unmanaged']
            stderr = io.StringIO()
            with patch.object(real.sys, 'argv', argv), patch.object(real.subprocess, 'run', side_effect=cli), redirect_stderr(stderr):
                code = real.run_cli()
            output = stderr.getvalue()

        # Exercise the actual installed watcher patch, including its return codes.
        edit = next(e for e in json.loads((ROOT / 'runtime-edits.json').read_text())
                    if e['path'] == 'bin/channel-watch.py')
        source = ('def archive(channel):\n    try:\n' + edit['new'] +
                  '\n        return True\n    except RuntimeError:\n        return False\n')
        namespace = {'subprocess': SimpleNamespace(run=lambda *a, **k: SimpleNamespace(returncode=code)),
                     'sys': real.sys, 'os': os, 'HOME': '/unused'}
        exec(compile(source, '<installed watcher hook>', 'exec'), namespace)
        return code, output, namespace['archive']('channel'), calls

    def test_close_archive_unmanaged_already_archived_returns_already(self):
        code, output, result, calls = self.invoke_close_and_watcher({
            'error': 'relay_error',
            'message': 'relay error 400: invalid: channel is archived; Authorization: TEST_HEADER',
        })
        self.assertEqual(code, 10)
        self.assertEqual(output, 'WORKFLOW_GATES_ERROR archived\n')
        self.assertEqual(result, 'already')
        self.assertEqual(len(calls), 2)

    def test_close_archive_unmanaged_permission_denied_returns_forbidden(self):
        for reason in ['actor not authorized', 'forbidden', 'not the owner', 'permission denied']:
            with self.subTest(reason=reason):
                code, output, result, _ = self.invoke_close_and_watcher({
                    'error': 'relay_error', 'message': 'relay error 403: ' + reason,
                })
                self.assertEqual((code, result), (11, 'forbidden'))
                self.assertEqual(output, 'WORKFLOW_GATES_ERROR forbidden\n')

    def test_unknown_or_not_found_does_not_report_closed(self):
        for category, message, expected, label in [
            ('relay_error', 'relay error 404: channel not found', 12, 'channel_not_found'),
            ('relay_error', 'relay error 400: invalid: workflow not found', 13, 'workflow_not_found'),
            ('relay_error', 'relay error 404: resource not found', 1, 'failed'),
            ('relay_error', 'unclassified failure TEST_HEADER', 1, 'failed'),
        ]:
            with self.subTest(message=message):
                code, output, result, _ = self.invoke_close_and_watcher({'error': category, 'message': message})
                self.assertEqual(code, expected)
                self.assertFalse(result)
                self.assertNotIn('TEST_HEADER', output)
                self.assertEqual(output, f'WORKFLOW_GATES_ERROR {label}\n')

    def test_permission_denials_keep_forbidden_across_cli_error_formats(self):
        for stderr in [
            'request failed: forbidden; Authorization: TEST_HEADER',
            json.dumps({'error': 'network_error',
                        'message': 'signed request failed: TEST_HEADER permission denied'}),
            json.dumps({'error': 'relay_error', 'message': 'relay error 403: actor not authorized'}),
            json.dumps({'error': 'auth_error', 'message': 'not the owner'}),
        ]:
            with self.subTest(stderr=stderr):
                self.assertEqual(gates.error_code(stderr), 'forbidden')

    def test_unclassified_non_json_errors_are_not_forwarded(self):
        self.assertEqual(gates.error_code('Authorization: TEST_HEADER'), 'failed')
        self.assertEqual(gates.error_code('[]'), 'failed')


class InstallerTests(unittest.TestCase):
    def test_missing_targets_report_all_paths_without_partial_install(self):
        for missing_names in [('b',), ('b', 'c')]:
            with self.subTest(missing=missing_names), tempfile.TemporaryDirectory() as tmp:
                home = Path(tmp) / 'home'
                source = Path(tmp) / 'source'
                source.mkdir()
                (home / 'bin').mkdir(parents=True)
                (source / 'install.py').write_text((ROOT / 'install.py').read_text())
                (source / 'buzz-workflows.py').write_text('pass\n')
                edits = [{'path': f'bin/{name}.py', 'old': 'x = 1', 'new': 'x = 2'}
                         for name in ['a', 'b', 'c']]
                # Multiple edits to a missing target must report its path just once.
                edits.append({'path': 'bin/b.py', 'old': 'x = 2', 'new': 'x = 3'})
                (source / 'runtime-edits.json').write_text(json.dumps(edits))
                for name in ['a', 'b', 'c']:
                    if name not in missing_names:
                        (home / f'bin/{name}.py').write_text('x = 1\n')
                result = subprocess.run([sys.executable, str(source / 'install.py'),
                                         '--home', str(home), '--apply'],
                                        capture_output=True, text=True, timeout=30)
                self.assertEqual(result.returncode, 1)
                expected = ', '.join(str(home / f'bin/{name}.py') for name in missing_names)
                self.assertEqual(result.stderr, f'missing: {expected}\n')
                self.assertEqual(result.stdout, '')
                self.assertEqual((home / 'bin/a.py').read_text(), 'x = 1\n')
                self.assertFalse((home / 'bin/buzz-workflows.py').exists())
                self.assertFalse((home / 'var/workflows/backups').exists())

    def test_preflight_is_all_or_nothing_and_repeat_install_is_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / 'home'
            source = Path(tmp) / 'source'
            source.mkdir()
            (home / 'bin').mkdir(parents=True)
            first, second = home / 'bin/a.py', home / 'bin/b.py'
            first.write_text('x = 1\n')
            second.write_text('drift = True\n')
            (source / 'buzz-workflows.py').write_text('pass\n')
            edits = [{'path': f'bin/{name}.py', 'old': 'x = 1', 'new': 'x = 2'} for name in ['a', 'b']]
            (source / 'runtime-edits.json').write_text(json.dumps(edits))
            with patch.object(installer, 'SOURCE', source):
                with self.assertRaisesRegex(RuntimeError, 'local file changed'):
                    installer.install(home, True)
                self.assertEqual(first.read_text(), 'x = 1\n')
                second.write_text('x = 1\n')
                installer.install(home)
                self.assertEqual(first.read_text(), 'x = 1\n')
                installer.install(home, True)
                installer.install(home, True)
                self.assertEqual(first.read_text(), 'x = 2\n')
                backups = list((home / 'var/workflows/backups').glob('*/bin/a.py'))
                self.assertEqual(len(backups), 1)
                self.assertEqual(backups[0].read_text(), 'x = 1\n')


if __name__ == '__main__':
    unittest.main()
