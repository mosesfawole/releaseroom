# Trust boundary

ReleaseRoom is a local, controlled workflow demonstration with fictional tickets and one allowlisted case. Switch authenticates the sender. The service compares the exact sender ID with its configured builder and human IDs. It does not infer identity from display names, text, or claims inside a message.

The service allows only `src/tickets.ts` to differ from Git HEAD, rejects untracked files, checks the fixed manifest hashes, and captures the HEAD, complete staged/unstaged diff, and file bytes before and after verification. Only the fixed Node harness and fixed regression test run; no chat-supplied command or path is executed. The harness has a timeout and output limit. Symlinked case and protected files are rejected.

The SHA-256 review hash covers canonical JSON containing case, patch, verification evidence, and explicit creation time. Approval requires the configured human and exact current hash. The service rechecks the repository before export. A serialized event queue, processed-message journal, exported-hash journal, staging directory, and atomic rename make ordinary replay and crash recovery deterministic. The CLI lock prevents two normal CLI processes from owning one journal.

The journal stores private sender IDs and test evidence. `.env` contains the gatekeeper key. `.runtime/`, `.env`, and `artifacts/` are ignored by Git. Errors posted to Switch redact configured secrets and bearer strings. Do not publish journals, environment files, or raw provider logs. Review screenshots and recordings manually before publication.

This is not an OS sandbox or a signed attestation system. A malicious builder with the same filesystem privileges can rewrite Git history, alter ignored dependencies or the journal, replace running software, or race filesystem checks. The baseline, installed dependencies, operator, OS account, and Switch administrator are trusted. For untrusted code, use separate OS identities, a read-only harness, an isolated runner, and transactional durable storage before adapting the design to production.

Tests execute code in `src/tickets.ts`; they therefore have the permissions of the operator. Use the disposable demo clone with fictional data and no production credentials. No deployment or remote write occurs as part of verification or export.

A stream gap pauses the journal until an operator reviews history and explicitly recovers. Process restarts subscribe at the stream head; new commands are required for events sent while offline. Room posting failures appear in sanitized CLI logs and may require reissuing a verification command with a new message ID. The local journal and exported bundle provide evidence if a delivery fails after a successful export.
