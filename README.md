# pi-subagents

ORGM Pi subagents package.

## Install

```bash
pi install git:github.com/osmargm1202/pi-subagents
```

This package is also loaded by the ORGM bundle:

```bash
pi install git:github.com/osmargm1202/pi-harness
```

## Owns

- Subagent prompt assets in `agents/` and `archive/subagents/`.
- Subagent discovery/deployment extension from ORGM `pi-harness`.
- Agent-status widgets/status line and `/orgm-agent-status` inspector.
- Subagent runtime/model/interaction helper libraries.

## Pi compatibility

Validated against **Pi 1.3.0**. The four Pi host packages remain wildcard runtime
peers (as recommended by Pi's package contract); development copies are pinned
exactly to 1.3.0 in `package.json` and `package-lock.json`. Older Pi versions are
not covered by this validation.

- `deploy_agent` launches the host package's CLI in one-shot JSON mode, including
  from SDK hosts (it does not relaunch an arbitrary `process.argv[1]`). Compiled
  hosts fall back to their executable or `pi` on PATH.
- JSON updates are delta-only; final messages are authoritative. `agent_end` may
  precede retries/recovery; only `agent_settled` arms the four-second exit-stall
  watchdog. Assistant `error`, `aborted`, and `length` stop reasons fail the tool
  even when JSON mode exits zero. Cancellation never becomes success.
- Cancellation and session shutdown terminate child process groups with SIGTERM,
  escalating to SIGKILL after three seconds. Shutdown awaits active work and
  clears deferred UI updates. No host signal handlers are replaced. On actual
  parent process exit, active groups are synchronously killed.
- Process-group cleanup is validated on Linux. Windows only supports direct-child
  termination here; descendant cleanup on Windows is not guaranteed.
- EventBus listeners use the disposer returned by `on()`. Provider-stop events
  only affect the matching deployment, and mode scoping reads the active branch.
- Status inspection/custom overlays require TUI mode. Ordinary supported dialogs
  may relay through RPC; JSON/print runs have no UI. The launch backend remains
  `embedded` (an isolated JSON subprocess), not RPC. `persistent`/`reuse` remain
  compatibility inputs for one-shot execution, not reusable sessions.

Tests use real subprocesses for framing, retry boundaries, termination escalation,
process-tree cancellation, and listener cleanup, without provider credentials.
Authenticated model calls and manual terminal interaction are not covered.

## Development

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npm run pack:check
```
