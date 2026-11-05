# Verification evidence — 5 November 2026

## Application checks

Verified from a fresh local clone of commit `78b0149` on Windows, using Node.js 24.19.0 and npm 11.17.0:

| Command | Observed result |
| --- | --- |
| `npm ci` | 50 packages installed; audit reported zero vulnerabilities |
| `npm test` | 7 test files, 22 tests passed |
| `npm run typecheck` | Exit 0 |
| `npm run build` | Exit 0 |
| `npm run demo:reset` | CASE-001 reset succeeded |
| `npm run verify:case` after reset | Exit 1; expected T-1 (open), received T-2 (closed) |
| `git restore src/tickets.ts` then `npm run verify:case` | Exit 0; protected regression test passed |
| `git status --short` | Empty after restoration |

The service integration tests use real temporary Git repositories and the actual protected verification harness. They cover configured-builder verification, configured-human approval, export files, replay across restart, staged patch changes, harness edits, failed verification, durable pause after event gaps, and bearer redaction. Protocol tests use a local HTTP/WebSocket server and check authentication, addressing, heartbeat cursor handling, reconnect gaps, and HTTP/network failures. These automated fixtures are not evidence of a live Switch/Codex demonstration.

## Local runtime preparation

Installed and observed inside Ubuntu 26.04 WSL: Node.js 24.19.0, npm 11.17.0, Docker Engine 29.1.3, and Docker Compose 2.40.3. Docker responds as the normal WSL user. No Windows group change was used.

The Node archive's SHA-256 matched the [official Node distribution checksum](https://nodejs.org/dist/v24.19.0/SHASUMS256.txt). The intended Console is the [official Switch Console 0.40.1 release](https://github.com/sandbox-quantum/switch/releases/tag/switch-console-v0.40.1), which bundles Switch core 0.31.0.

AgentRouter rejected the existing credential with HTTP 401. The user explicitly authorized using their existing Codex sign-in instead for the live builder demo. This supersedes the earlier AgentRouter-only constraint for that demo. No key or token is included in public evidence.

## Live demonstration status

Pending: official Switch server health, real room transcript, genuine Codex builder action, personally sent human approval, and resulting live exported bundle. No live transcript, video, deployment, users, time savings, or production safety claim is made at this checkpoint.
