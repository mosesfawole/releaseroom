# ReleaseRoom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and demonstrate a Switch-centered workflow that turns a bug report into a tested patch and a human-approved handoff.

**Architecture:** A small TypeScript sample application and a deterministic gatekeeper live in one public repository. The gatekeeper consumes authenticated Switch room events, runs an allowlisted verification harness, hashes a review bundle, enforces human-only approval, and posts the outcome back to Switch. Official Switch Console/core run locally in Ubuntu WSL with Mattermost and a genuine Codex builder session.

**Tech Stack:** Node.js 24, TypeScript 5.9, Vitest, Zod, `ws`, Git, official Switch Console 0.40.1/core 0.31.0, Docker Engine in Ubuntu WSL.

**Spec:** `docs/superpowers/specs/2026-11-05-releaseroom-design.md`

## Global Constraints

- Target Flip the Switch **Best Business Workflow**; Switch must be central to the demonstrated workflow.
- Use only the existing free AgentRouter/Codex allowance and local/free Switch services.
- Keep ClearCart and port 3000 untouched; use a separate repository and non-conflicting runtime ports.
- Accept approval only from the configured human Switch participant ID and exact current bundle hash.
- Never commit or print Switch keys, AgentRouter credentials, participant IDs, or private provider configuration.
- The final repository must pass `npm test`, `npm run typecheck`, and `npm run build` with clean output.
- The entrant personally performs hackathon registration and final submission.

---

### Task 1: Create the isolated repository and ticket-filter contract

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `src/tickets.ts`
- Create: `tests/tickets.test.ts`

**Interfaces:**
- Produces: `Ticket`, `TicketStatus`, and `filterTickets(tickets, status): Ticket[]`.

- [x] **Step 1: Initialize Git and add the Node/TypeScript manifest**

Use ESM, Node `>=24`, scripts `test`, `typecheck`, and `build`, with runtime dependencies `ws` and `zod`, and dev dependencies `typescript`, `vitest`, `@types/node`, and `@types/ws`.

- [x] **Step 2: Write the failing ticket-filter test**

```ts
import { describe, expect, it } from "vitest";
import { filterTickets, type Ticket } from "../src/tickets.js";

const tickets: Ticket[] = [
  { id: "T-1", title: "Login loop", status: "open" },
  { id: "T-2", title: "Receipt typo", status: "closed" },
];

describe("filterTickets", () => {
  it("returns only tickets whose status exactly matches the requested status", () => {
    expect(filterTickets(tickets, "open").map((ticket) => ticket.id)).toEqual(["T-1"]);
  });
});
```

- [x] **Step 3: Run the test and confirm RED**

Run: `npm test -- tests/tickets.test.ts`
Expected: FAIL because `src/tickets.ts` does not exist or export `filterTickets`.

- [x] **Step 4: Implement the minimal correct filter**

```ts
export type TicketStatus = "open" | "closed";
export type Ticket = { id: string; title: string; status: TicketStatus };

export function filterTickets(tickets: readonly Ticket[], status: TicketStatus): Ticket[] {
  return tickets.filter((ticket) => ticket.status === status);
}
```

- [x] **Step 5: Run tests and type checking, then commit**

Run: `npm test -- tests/tickets.test.ts && npm run typecheck`
Expected: 1 test passes and TypeScript exits 0.
Commit: `feat: add support ticket filter contract`

### Task 2: Add a reproducible seeded bug and protected verification harness

**Files:**
- Create: `demo/seeded-bug/tickets.ts`
- Create: `scripts/reset-demo-case.mjs`
- Create: `harness/manifest.json`
- Create: `harness/verify-case.mjs`
- Create: `tests/demo-case.test.ts`

**Interfaces:**
- Produces: `npm run demo:reset` and `npm run verify:case`.
- `verify:case` prints JSON `{ caseId, passed, command, exitCode, stdout, stderr }` and exits nonzero on failure.

- [x] **Step 1: Write a failing integration test for reset and verification**

The test copies the project fixture to a temporary directory, runs the reset script, asserts `verify:case` reports `passed: false`, restores the correct `src/tickets.ts`, and asserts `passed: true`. It also changes the protected regression test and asserts verification rejects the altered harness input.

- [x] **Step 2: Run the integration test and confirm RED**

Run: `npm test -- tests/demo-case.test.ts`
Expected: FAIL because reset and verification scripts do not exist.

- [x] **Step 3: Implement the seeded bug and reset script**

The seeded implementation deliberately uses `ticket.status !== status`. `reset-demo-case.mjs` accepts only a target root beneath the current repository and copies only `demo/seeded-bug/tickets.ts` to `src/tickets.ts`.

- [x] **Step 4: Implement the verification harness**

`verify-case.mjs` checks SHA-256 hashes of the allowlisted test and harness files from `harness/manifest.json`, then runs exactly `npm test -- tests/tickets.test.ts`. It never accepts an arbitrary command from input.

- [x] **Step 5: Run the test suite and commit**

Run: `npm test -- tests/demo-case.test.ts && npm test`
Expected: all tests pass.
Commit: `feat: add reproducible release verification case`

### Task 3: Create immutable review bundles and approval state

**Files:**
- Create: `src/gatekeeper/types.ts`
- Create: `src/gatekeeper/bundles.ts`
- Create: `src/gatekeeper/approvals.ts`
- Create: `tests/bundles.test.ts`
- Create: `tests/approvals.test.ts`

**Interfaces:**
- Produces: `createReviewBundle(input): Promise<ReviewBundle>`.
- Produces: `approveBundle(state, request): ApprovalResult`.
- `ReviewBundle` includes `caseId`, `diff`, `verification`, `createdAt`, and `hash`.

- [x] **Step 1: Write failing bundle tests**

Assert a literal fixture creates the expected SHA-256 hash, paths outside the repository are rejected, and a failed verification cannot create a ready bundle.

- [x] **Step 2: Run bundle tests and confirm RED**

Run: `npm test -- tests/bundles.test.ts`
Expected: FAIL because bundle functions are missing.

- [x] **Step 3: Implement canonical serialization and bundle hashing**

Hash UTF-8 JSON with sorted keys and no volatile data other than the explicit `createdAt` input. Capture `git diff --binary -- src` using a fixed argument array, not a shell string.

- [x] **Step 4: Write failing approval tests**

Cover exact human sender acceptance, builder sender rejection, wrong human rejection, stale hash rejection, and duplicate message ID idempotency.

- [x] **Step 5: Implement approval state and run all tests**

Use a JSON journal containing current bundle hashes, processed message IDs and exported bundle hashes. Approval requires `senderId === configuredHumanId` and exact case/hash match.
Run: `npm test && npm run typecheck`
Commit: `feat: enforce hashed human approval`

### Task 4: Implement the Switch protocol client

**Files:**
- Create: `src/switch/client.ts`
- Create: `src/switch/protocol.ts`
- Create: `tests/switch-client.test.ts`

**Interfaces:**
- Produces: `SwitchClient.connect(): Promise<void>`, `postMessage(roomId, content)`, and async event delivery for addressed room messages.
- Consumes: `SWITCH_BASE_URL`, `SWITCH_AGENT_ID`, `SWITCH_AGENT_API_KEY`, `SWITCH_ROOM_ID`.

- [x] **Step 1: Write failing protocol tests against a local fake server**

Use a real local HTTP/WebSocket test server. Assert bearer authorization, `/health`, WebSocket URL construction, ping/pong cursor handling, addressed-message delivery, ignored unaddressed messages, and reconnect-gap propagation.

- [x] **Step 2: Run protocol tests and confirm RED**

Run: `npm test -- tests/switch-client.test.ts`
Expected: FAIL because the client is missing.

- [x] **Step 3: Implement schemas and the minimal client**

Validate frames with Zod. Connect to `/agents/{agentId}/connection/ws`, pass the stable connection ID and room claim, reply to pings, and POST messages through `/agents/{agentId}/message` with bearer authorization. Surface `gap`, `cursor-expired`, network and non-2xx errors.

- [x] **Step 4: Run protocol tests and commit**

Run: `npm test -- tests/switch-client.test.ts && npm run typecheck`
Commit: `feat: connect gatekeeper to Switch rooms`

### Task 5: Orchestrate verify, approve and export messages

**Files:**
- Create: `src/gatekeeper/commands.ts`
- Create: `src/gatekeeper/service.ts`
- Create: `src/cli.ts`
- Create: `tests/gatekeeper-service.test.ts`
- Create: `.env.example`

**Interfaces:**
- Consumes room messages `verify CASE-001` and `approve CASE-001 <sha256>`.
- Produces room status messages and files under `artifacts/<caseId>/<hash>/`.

- [x] **Step 1: Write failing service tests**

Use a real temporary Git repository and a small in-process Switch fake. Assert builder verification produces an approval request, a configured human approval exports once, changed diffs invalidate old approvals, and verification/provider errors remain visible.

- [x] **Step 2: Run service tests and confirm RED**

Run: `npm test -- tests/gatekeeper-service.test.ts`
Expected: FAIL because command parsing and service orchestration are missing.

- [x] **Step 3: Implement strict commands and orchestration**

Accept exact ASCII command forms, one known case, and fixed project paths. Export `review.json`, `changes.patch`, and `HANDOFF.md` only after approval. Redact bearer values from errors before posting.

- [x] **Step 4: Add the CLI and environment validation**

The CLI validates environment variables, checks the clean harness manifest, loads the JSON journal, connects, and shuts down cleanly on SIGINT/SIGTERM.

- [x] **Step 5: Run the complete suite and commit**

Run: `npm test && npm run typecheck && npm run build`
Commit: `feat: complete ReleaseRoom approval workflow`

### Task 6: Document the room, agent and reproducible demo

**Files:**
- Create: `README.md`
- Create: `docs/room-instructions.md`
- Create: `docs/codex-builder-instructions.md`
- Create: `docs/demo-script.md`
- Create: `docs/security.md`
- Create: `LICENSE`

**Interfaces:**
- Produces exact setup, reset, runtime, room, verification, approval and recording steps for a fresh clone.

- [ ] **Step 1: Write the documentation from verified commands**

Explain the fictional data, fixed case, trust boundary, human approval identity, secrets, Switch version, WSL runtime, and limitations. Include no credential values or screenshots containing them.

- [ ] **Step 2: Exercise the README from a fresh local clone**

Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `npm run demo:reset`, and the documented restore command. Record the actual output in `docs/evidence.md`.

- [ ] **Step 3: Commit**

Commit: `docs: add ReleaseRoom setup and demo guide`

### Task 7: Prove the official Switch runtime and genuine Codex workflow

**Files:**
- Create: `docs/evidence.md`
- Create locally only: `.env`
- Create locally only: `.runtime/`

**Interfaces:**
- Produces an actual Switch room transcript and final review bundle for CASE-001.

- [ ] **Step 1: Install the free runtime inside Ubuntu WSL**

Install Ubuntu's `docker.io`, Node.js 24/npm if needed, and official Switch Console 0.40.1 Linux `.deb`. Add only the WSL user to its WSL-local `docker` group. Verify package origins and versions. Do not alter the Windows `docker-users` group.

- [ ] **Step 2: Start Switch Console through WSLg and create a local server**

Use the Console's supported **On this computer** path with local Mattermost. Configure non-conflicting ports if prompted. Confirm the server's `/health` endpoint.

- [ ] **Step 3: Configure Codex and the ReleaseRoom agents**

Make the existing provider available inside WSL without printing or committing credentials. Register `release-builder` with the repository as its working directory. Register the gatekeeper through a local registration key and store its returned API key only in `.env`.

- [ ] **Step 4: Create the room and run the real scenario**

Create `release-room`, attach the reviewed room instructions, invite both agents, reset CASE-001, post the bug, observe the genuine Codex patch, invoke verification, post the human approval personally, and confirm the exported bundle.

- [ ] **Step 5: Capture evidence and run final verification**

Save redacted screenshots/transcript references, exact version output and bundle hashes. Run `npm test && npm run typecheck && npm run build` again and inspect `git status --short`.

- [ ] **Step 6: Commit runtime-safe evidence**

Commit only redacted evidence and public documentation: `docs: record verified Switch workflow`.

### Task 8: Prepare the entrant-owned submission package

**Files:**
- Create: `docs/submission-draft.md`
- Create: `docs/video-shot-list.md`

**Interfaces:**
- Produces reviewed title, tagline, story, technology disclosure, repository-link field, video shot list and final checklist.

- [ ] **Step 1: Draft factual submission copy from verified evidence**

Do not claim deployment, users, time savings or safety properties beyond the controlled demonstration. Disclose Codex/AgentRouter assistance, Switch, Mattermost, Node, TypeScript, Vitest and fictional sample data.

- [ ] **Step 2: Prepare the under-three-minute shot list**

Show the initial failure, Switch room, genuine builder action, independent verification, exact-hash human approval, exported bundle and final passing test.

- [ ] **Step 3: Run final repository checks and commit**

Run: `npm ci && npm test && npm run typecheck && npm run build && git status --short`
Expected: all commands exit 0; status contains only deliberately untracked local runtime files ignored by `.gitignore` or is clean.
Commit: `docs: prepare Flip the Switch submission`

The entrant then personally completes WeMakeDevs registration and submission before 7 November 2026, 19:29 CET/WAT.
