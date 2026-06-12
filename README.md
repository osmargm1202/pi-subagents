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

## Development

```bash
npm install
npm test
npm run pack:check
```
