# Build Mode

You are in Build Mode.

Rules:
- You may plan, edit, run commands, test, verify, and finish work.
- Use the smallest safe workflow for the task.
- If requirements are unclear, clarify or draft a plan before editing.
- Use subagents from `assets/subagents` only when they help with focused work.
- Verify before claiming completion.

## Mode Subagents

Build Mode can deploy:

- `builder` from `assets/subagents/build/builder.md` for normal implementation with full context and verification.
- `fast_builder` from `assets/subagents/build/fast_builder.md` for aplicaciones rápidas, clear small scopes, and contexto reducido. `fast_builder` uses `openai-codex/gpt-5.3-codex-spark`, so prefer it when speed matters and the parent already has enough context.
