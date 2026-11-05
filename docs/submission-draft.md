# ReleaseRoom submission draft

Status: draft. The public repository and completed live workflow evidence are available. The entrant completes registration and final submission personally.

## Title

ReleaseRoom

## Tagline

From a bug report to a verified, human-approved patch in one Switch room.

## Track

Best Business Workflow

## Problem

When an AI coding agent reports that a fix is ready, a reviewer still needs to connect the proposed patch, its test evidence, and the decision to approve it. That handoff is easy to lose across a terminal and a team conversation.

## What we built

ReleaseRoom brings that handoff into a Switch-connected team room. A human reports a fictional ticket-filter bug, a Codex builder prepares the fix, and a deterministic TypeScript gatekeeper checks the repository and runs a protected regression test. The gatekeeper produces a SHA-256 review hash covering the patch and test evidence. It exports the handoff only when the configured human approves that exact hash and the repository still matches the verified snapshot.

The export contains a patch, machine-readable review bundle, and handoff notes. It does not deploy or merge. Changed code needs new verification; repeated approval messages cannot export the same bundle twice; a connection gap pauses processing for operator review.

## Why Switch matters

Switch connects the coding agent and gatekeeper to the same room and supplies authenticated sender identities and addressed events. The workflow relies on that identity and conversation transport to distinguish the builder's verification request from the human's approval. The gatekeeper is ordinary software and makes no model calls.

## Implementation and limits

Node.js, TypeScript, Vitest, Zod, WebSocket transport, Git, Switch, Mattermost, and Codex. AI-assisted development is disclosed. The live builder is configured to use the entrant's existing Codex sign-in, authorized after an earlier AgentRouter credential was rejected.

This demonstration has one fictional case and trusts the operator's OS account, Git baseline, and installed dependencies. It is not a sandbox for hostile code or a production release system. No real customer data, deployment, users, or measured time savings are claimed.

## Evidence to attach

- Public repository: https://github.com/mosesfawole/releaseroom .
- Demo video (YouTube, unlisted): https://youtu.be/CgD3kSIa8W0 . This 110-second walkthrough includes synthetic English narration, uses actual room screenshots and discloses the user-authorized approval relay.
- Downloadable narrated MP4: https://github.com/mosesfawole/releaseroom/releases/download/v0.1.0/releaseroom-demo-narrated.mp4 .
- Downloadable handoff: https://github.com/mosesfawole/releaseroom/releases/download/v0.1.0/releaseroom-handoff.zip .
- Current checks: see `docs/evidence.md` for fresh-clone tests and exact observed results.
- Live builder, independent verification, exact-hash approval and exported handoff: confirmed in `docs/evidence.md`. The user approved the exact hash in Codex and explicitly authorized the assistant to relay it from the local reviewer account; this is disclosed, without claiming the user physically typed in Mattermost.

The official event page lists 7 November 2026, 11:59 PM IST as the deadline, equivalent to 19:29 CET. Verify the entry form before submitting: https://www.wemakedevs.org/hackathons/switch . The official rules prohibit automated registration/submission: https://www.wemakedevs.org/hackathons/switch/rules .
