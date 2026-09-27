import copy
from contextlib import redirect_stderr
import io
import importlib.util
import json
import os
from pathlib import Path
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
            next(r for r in self.rows if r['workflow_id'] == args[5])['content'] = content
        if op == ('workflows', 'delete'):
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
        verifier = patch.object(gates, 'verify_absent')
        self.absence = verifier.start()
        self.addCleanup(verifier.stop)

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

    def test_cleanup_disables_step_before_delete_and_failed_probe_retains_channel(self):
        gates.ensure('channel', 'work')
        self.absence.side_effect = RuntimeError('not confirmed')
        with self.assertRaises(RuntimeError):
            gates.remove('channel', close=True)
        operations = [c[:2] for c in self.relay.calls]
        self.assertLess(operations.index(('workflows', 'update')), operations.index(('workflows', 'delete')))
        self.assertNotIn(('channels', 'delete'), operations)

    def test_absence_probe_requires_precise_not_found_error(self):
        from types import SimpleNamespace
        self.mock.stop()
        # Exercise the real verifier, not the default cleanup stub.
        real = module('probe_gates', ROOT / 'buzz-workflows.py')
        for stderr, code, valid in [
            ('{"error":"relay_error","message":"relay error 400: invalid: workflow not found"}', 2, True),
            ('{"error":"auth_error","message":"forbidden"}', 3, False),
            ('', 0, False),
            ('not json', 2, False),
        ]:
            with patch.object(real.subprocess, 'run', return_value=SimpleNamespace(returncode=code, stderr=stderr)):
                if valid:
                    real.verify_absent('workflow')
                else:
                    with self.assertRaises(RuntimeError):
                        real.verify_absent('workflow')

    def test_owner_filter_and_safe_test_scope(self):
        for definition in gates.definitions('approval').values():
            self.assertEqual(definition['trigger']['filter'], f'trigger_author == "{gates.OWNER}"')
        for definition in gates.definitions('work', test='a' * 64).values():
            self.assertIn('a' * 64, definition['trigger']['filter'])
            self.assertIn('실행하지 않습니다', definition['steps'][0]['text'])


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
        for category, message, expected in [
            ('relay_error', 'relay error 404: channel not found', 12),
            ('network_error', 'signed request failed: TEST_HEADER forbidden', 1),
            ('relay_error', 'unclassified failure TEST_HEADER', 1),
        ]:
            with self.subTest(message=message):
                code, output, result, _ = self.invoke_close_and_watcher({'error': category, 'message': message})
                self.assertEqual(code, expected)
                self.assertFalse(result)
                self.assertNotIn('TEST_HEADER', output)

    def test_non_json_errors_are_not_forwarded(self):
        self.assertEqual(gates.error_code('Authorization: TEST_HEADER'), 'failed')
        self.assertEqual(gates.error_code('[]'), 'failed')


class InstallerTests(unittest.TestCase):
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
