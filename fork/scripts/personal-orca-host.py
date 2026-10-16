#!/usr/bin/env python3
"""Local task check for the personal release. Confirms the Mac can be replaced. Does not read or write user data."""

import json
import os
from pathlib import Path
import subprocess
import sys

MAC_APP = Path("/Applications/Orca.app")
LOCAL_CLI = MAC_APP / "Contents/Resources/bin/orca"
DONE_STATES = {"done", "inactive"}
PEER_PREFIX = "runtime:"


def run(argv, timeout=120):
    # Drop the caller's Orca routing so a release started in a managed terminal cannot query another host.
    environment = {k: v for k, v in os.environ.items() if not k.startswith("ORCA_")}
    environment["ORCA_BACKGROUND_LAUNCH"] = "1"
    result = subprocess.run(
        [str(arg) for arg in argv], capture_output=True, text=True,
        env=environment, timeout=timeout,
    )
    if result.returncode:
        raise RuntimeError(f"{Path(argv[0]).name} 执行失败，退出码 {result.returncode}")
    return result.stdout.strip()


def cli(*args, timeout=120):
    data = json.loads(run([LOCAL_CLI, *args, "--json"], timeout=timeout))
    if not data.get("ok"):
        raise RuntimeError(f"Orca 请求失败：{data.get('error', {}).get('code', 'unknown')}")
    return data["result"]


def check():
    status = cli("status")
    if status["runtime"]["state"] != "ready":
        raise RuntimeError("本机 runtime 不可确认；请先启动并连接 Orca")
    terminals = cli("terminal", "list", "--limit", "1000")
    worktrees = cli("worktree", "ps", "--limit", "1000")
    # Paired runtimes are checked per host. An omitted SSH or WSL host is unverifiable, not idle.
    scope = terminals.get("hostScope", {})
    if "local" not in scope.get("hostIds", []) or any(
        inventory.get("truncated") for inventory in (terminals, worktrees)
    ):
        raise RuntimeError("本机任务清单不完整，不能视为没有任务")
    for inventory in (terminals, worktrees):
        omitted = inventory.get("hostScope", {}).get("omittedHostIds")
        # A folder row may have no host id. That exception must not hide a failed scan when a Git repo exists.
        local_census = inventory is worktrees
        if omitted is None or any(
            not item.startswith(PEER_PREFIX) and not (local_census and item == "local")
            for item in omitted
        ):
            raise RuntimeError("本机有未覆盖的执行主机，任务状态 unverifiable")
        if local_census and "local" in omitted:
            repos = cli("repo", "list")["repos"]
            if any(
                not repo.get("connectionId") and repo.get("executionHostId") in (None, "", "local")
                for repo in repos
            ):
                raise RuntimeError("本机 Git 工作区未被 ps 覆盖，任务状态 unverifiable")
    live = [
        t["handle"] for t in terminals["terminals"]
        if t["connected"] or not t.get("exitCause")
    ]
    agents = [
        w["worktreeId"] for w in worktrees["worktrees"]
        if w.get("unverifiableTerminalCount") is None
        or w["unverifiableTerminalCount"] > 0
        or any(a.get("structuredHostOwned") or a["state"] not in DONE_STATES for a in w["agents"])
    ]
    return {
        "host": "local", "version": status["runtime"]["appVersion"],
        "runtimeId": status["runtime"]["runtimeId"],
        "terminals": live, "agentWorkspaces": agents,
        "idle": not live and not agents,
    }


def main(host, action):
    if host != "local" or action != "check":
        raise ValueError("只支持本机检查；远端安装事务已随自管 serve 退役")
    return check()


if __name__ == "__main__":
    try:
        print(json.dumps(main(*sys.argv[1:3]), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
