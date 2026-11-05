# ReleaseRoom Design

ReleaseRoom targets Flip the Switch's Best Business Workflow track. In one Switch room, a person reports a small software bug, a Codex builder prepares a fix, a deterministic gatekeeper independently verifies it, and the person approves the exact verified bundle before a handoff is exported.

The demo uses one fictional support-ticket application with a seeded status-filter bug. Switch supplies the authenticated room event stream and shared conversation. Codex supplies the AI development work through the user's existing free AgentRouter allowance. The gatekeeper is ordinary TypeScript software, not a second model.

The gatekeeper accepts `verify CASE-001` only from the builder and `approve CASE-001 <bundle-hash>` only from the configured human participant ID. Verification checks the repository boundary, immutable harness manifest, diff, and fixed test command. It writes a review bundle containing the case, diff, test evidence and SHA-256 hash. Approval becomes stale whenever the diff changes. Replayed message IDs cannot export twice, and connection gaps pause processing for recovery.

The public repository contains the fixed application, a deterministic script that restores the seeded bug for demos, tests, room and agent instructions, `.env.example`, and a setup guide. Credentials, participant IDs and private Switch keys remain local. The demo exports a patch and handoff report; it never deploys to production or writes to external repositories.

Switch Console 0.40.1 and Switch core 0.31.0 will run inside the existing Ubuntu WSL environment with a native Linux Docker Engine. The official Linux Console build will use WSLg. This avoids modifying the Windows `docker-users` group. The Switch runtime uses ports that do not collide with ClearCart on port 3000.

The deadline is 7 November 2026 at 19:29 CET/WAT. The entrant must personally register and submit because the official rules prohibit automated registration/submission. AI-assisted project development is permitted.

