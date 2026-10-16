"""Local task-check tests. The CLI is mocked and the real install is not touched."""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "personal_orca_host", Path(__file__).with_name("personal-orca-host.py")
)
HOST = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HOST)
VERSION = "1.0.0-local.new"


class TaskChecks(unittest.TestCase):
    def check(self, terminals=None, agents=None, truncated=False, scope=None,
              workspace_scope=None, empty_workspaces=False, repos=None):
        complete_scope = {"hostIds": ["local"], "omittedHostIds": []}
        replies = [
            {"runtime": {"state": "ready", "appVersion": VERSION, "runtimeId": "runtime"}},
            {"terminals": terminals or [], "truncated": truncated,
             "hostScope": scope if scope is not None else complete_scope},
            {"worktrees": [] if empty_workspaces else [
                {"worktreeId": "folder:test", "unverifiableTerminalCount": 0, "agents": agents or []}
             ], "truncated": False,
             "hostScope": workspace_scope if workspace_scope is not None else complete_scope},
            {"repos": repos or []},
        ]
        with patch.object(HOST, "cli", side_effect=replies):
            return HOST.check()

    def test_disconnected_terminal_is_not_evidence_of_exit(self):
        result = self.check(terminals=[{"handle": "term_test", "connected": False}])
        self.assertFalse(result["idle"])
        self.assertEqual(result["terminals"], ["term_test"])

    def test_incomplete_inventory_refuses_update(self):
        for options in ({"truncated": True}, {"scope": {"hostIds": []}}):
            with self.subTest(options=options), self.assertRaises(RuntimeError):
                self.check(**options)

    def test_remote_scopes_are_checked_on_their_own_hosts(self):
        self.assertTrue(self.check(scope={"hostIds": ["local"],
                                          "omittedHostIds": ["runtime:linux-a"]})["idle"])

    def test_omitted_execution_host_blocks_update_in_either_inventory(self):
        incomplete = {"hostIds": ["local"], "omittedHostIds": ["ssh:unreachable"]}
        for options in ({"scope": incomplete}, {"workspace_scope": incomplete}):
            with self.subTest(options=options), self.assertRaises(RuntimeError):
                self.check(**options)

    def test_folder_or_empty_scope_requires_complete_terminal_census(self):
        empty = {"hostIds": [], "omittedHostIds": ["local"]}
        for no_rows in (True, False):
            with self.subTest(empty=no_rows):
                self.assertTrue(self.check(workspace_scope=empty, empty_workspaces=no_rows)["idle"])
        with self.assertRaises(RuntimeError):
            self.check(workspace_scope=empty, empty_workspaces=True, scope=empty)

    def test_idle_but_running_structured_agent_blocks_update(self):
        self.assertFalse(self.check(agents=[{"state": "idle", "structuredHostOwned": True}])["idle"])

    def test_missing_git_workspace_never_hides_structured_agent(self):
        with self.assertRaises(RuntimeError):
            self.check(workspace_scope={"hostIds": [], "omittedHostIds": ["local"]},
                       empty_workspaces=True, repos=[{"executionHostId": "local"}])


class LocalOnlyContract(unittest.TestCase):
    def test_only_local_check_is_supported(self):
        for args in (("linux-a", "check"), ("local", "install"), ("linux-b", "rollback")):
            with self.subTest(args=args), self.assertRaises(ValueError):
                HOST.main(*args)


if __name__ == "__main__":
    unittest.main(verbosity=2)
