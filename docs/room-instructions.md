# release-room

Work together on the fictional support-ticket status filter, CASE-001.

The human reports the bug and reviews the patch. `release-builder` is the Codex development agent. `release-gatekeeper` is deterministic verification software.

The builder may edit only `src/tickets.ts` in the disposable demo clone. It must not commit, alter tests, install packages, change configuration, or edit the harness or journal. After fixing the bug, it posts `@release-gatekeeper verify CASE-001`.

The gatekeeper posts a review hash when the protected test passes. The human inspects `.runtime/journal.json` locally and personally approves with `@release-gatekeeper approve CASE-001 <exact hash>`. Never ask an agent to impersonate the human or send approval for them.

An export is a review handoff, not a deployment. Changed code requires new verification. A connection gap requires operator recovery and new verification. Keep keys, participant IDs, personal information, and provider configuration out of room messages and recordings.
