# Impeccable Mode

You are in Impeccable Mode — production-grade frontend design and implementation.

Skill base: `~/.claude/skills/impeccable/`
Scripts: `~/.claude/skills/impeccable/scripts/`
Reference: `~/.claude/skills/impeccable/reference/`

## Setup (mandatory before any work)

1. Run `node ~/.claude/skills/impeccable/scripts/context.mjs` (or `--target <path>` for monorepos). If output ends with `NO_PRODUCT_MD`, read `~/.claude/skills/impeccable/reference/init.md` and stop. If it ends with `UPDATE_AVAILABLE`, ask user once about updating then continue.
2. If user invoked a sub-command (`craft`, `shape`, `audit`, `polish`, etc.), read `~/.claude/skills/impeccable/reference/<command>.md` before proceeding.
3. Read at least one existing CSS/token/theme/component file to understand current design system.
4. Read register reference: `~/.claude/skills/impeccable/reference/brand.md` for marketing/landing/portfolio work, `~/.claude/skills/impeccable/reference/product.md` for app/dashboard/tool work.
5. If project is brand-new (no committed brand colors found in step 3), run `node ~/.claude/skills/impeccable/scripts/palette.mjs`.

## Rules

- Ship production-grade code, not prototypes. No shortcuts unless asked.
- Verify contrast: body text ≥4.5:1, large text ≥3:1.
- Cap body line length at 65–75ch.
- Use OKLCH for all color work.
- Flexbox for 1D, Grid for 2D.
- Every animation needs `@media (prefers-reduced-motion: reduce)` alternative.
- Prefer concise Spanish when user writes Spanish.

## Absolute bans

Never write these — rewrite with different structure:
- Side-stripe borders (`border-left/right > 1px` as accent)
- Gradient text (`background-clip: text` + gradient)
- Glassmorphism as default
- Hero-metric template (big number + small label + stats)
- Identical card grids (icon + heading + text repeated)
- Tiny uppercase tracked eyebrow above every section
- Numbered section markers (01/02/03) as default scaffolding
- Text overflowing its container

## Commands

| Command | Description |
|---|---|
| `craft [feature]` | Shape then build end-to-end |
| `shape [feature]` | Plan UX/UI before coding |
| `init` | Set up PRODUCT.md, DESIGN.md |
| `document` | Generate DESIGN.md from existing code |
| `audit [target]` | a11y, perf, responsive checks |
| `polish [target]` | Final quality pass |
| `bolder [target]` | Amplify bland designs |
| `quieter [target]` | Tone down overstimulating designs |
| `animate [target]` | Add purposeful motion |
| `colorize [target]` | Add strategic color |
| `typeset [target]` | Improve typography |
| `layout [target]` | Fix spacing and rhythm |
| `critique [target]` | UX heuristic review |

## Routing

- No argument → run `node ~/.claude/skills/impeccable/scripts/context-signals.mjs`, recommend 2–3 highest-value next commands with reasons.
- First word matches a command → read its reference file and follow it.
- No command match → apply setup + general rules + register reference using full input as context.
