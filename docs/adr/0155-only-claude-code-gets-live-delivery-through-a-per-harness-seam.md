# Only Claude Code gets live delivery, through a per-harness seam

2026-11-27 (mattpocock/cookout#954). Asked for by Matt on 2026-11-27 (board msg 7989): cookout should be able to use any harness, harness-specific tooling is fine, and anything Claude Code only must be labelled as such. It supersedes the framing of [ADR 0147](0147-the-runner-delivers-to-an-open-session-through-its-inbox-socket.md), whose title says "an open session" while everything it decides is Claude Code's. Its decisions about Claude Code's inbox socket, its line, its fall-back reasons and its `crossSessionInbound` warning stand unchanged.

## Context

ADR 0147 delivered mentions into an open Claude Code session, but the runner's general layers called Claude Code's modules directly: `live-delivery.ts` imported Claude Code's reach and posting, the wake queue's requirements named Claude Code's, the runner log's `fell-back` reasons were Claude Code's inbox states, and `runner status` printed a `crossSessionInbound` warning that never said Claude Code. A reader couldn't tell what was general from what only Claude Code had.

## Decision

- **One seam.** `live-delivery-seam.ts` defines what a harness gives the runner for live delivery: whether a registration's session can be reached now (`none`, `closed` with the harness's own reason, or `open` with how to post into it), how many minutes a delivery waits for its ack before it falls back to a wake run, and its own warning, if any, that the session would hold the runner's messages.
- **Chosen by the registration's harness.** `live-delivery-harnesses.ts` picks the adapter by `registration.harness`. Claude Code (`claude-code-live-delivery.ts`, over the `claude-code-*` modules) is the only real one. Every other harness gets none: it never looks for an open session and always wakes, logging `woken`. Outside the adapter, no runner module imports a `claude-code-*` module.
- **Labelled by harness.** `delivered-live` and `fell-back` log lines carry the `harness` they came from, and a log line's `reason` is the harness's own. `runner status --json` gives `liveDelivery` with its `harness`, and the text warning says "Claude Code session".
- **What stays Claude Code only is said to be.** Joining (keyed by `CLAUDE_CODE_SESSION_ID`, the only harness session ID cookout reads), `{session-id}` in a wake command, and live delivery are labelled Claude Code only in the CLI help, `skills/cookout/SKILL.md` and `docs/agents.md`.

## Considered options

- **Leave the runner calling Claude Code directly, and only relabel.** Rejected: the general layers would still be Claude Code's in general clothing.
- **A list of every harness's fall-back reasons in the log schema.** Rejected: the log would then depend on each adapter. A reason is the harness's string, named beside its harness.
- **Live delivery for another harness now.** Out of scope: making Codex or another harness join or deliver live is #953's design question.

## Consequences

- Behaviour for Claude Code is unchanged: the same socket line, the same 10-minute ack window, the same reasons and warning.
- A new harness's live delivery is one adapter and one entry in `live-delivery-harnesses.ts`.
- `runner logs` and `runner status --json` gain a `harness` field.
