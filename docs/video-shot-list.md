# Recording plan — target 2 minutes 40 seconds

Do not record this as a completed live demonstration until the actual Switch/Codex scenario has run. The human sends approval personally. Review every frame for secrets and private IDs.

| Time | Picture | Narration |
| --- | --- | --- |
| 0:00–0:15 | ReleaseRoom README and workflow | “ReleaseRoom turns a bug report into a verified patch and a human-approved handoff in one Switch room.” |
| 0:15–0:35 | Real failing regression output on seeded baseline | “This fictional ticket filter shows closed tickets when someone selects open tickets.” |
| 0:35–1:05 | Actual Switch-connected room and genuine builder action | “The human asks the Codex builder to reproduce and fix it. The builder changes only the filter and requests verification.” |
| 1:05–1:35 | Gatekeeper response and redacted local diff/test evidence | “A separate deterministic gatekeeper checks the repository, runs the protected test, and hashes the patch and evidence.” |
| 1:35–1:55 | Human personally posts exact-hash approval | “The configured human approves this exact hash. Any intervening patch change invalidates it.” |
| 1:55–2:20 | Real export notification and three output files | “The gatekeeper exports a patch, review bundle, and handoff notes. This does not deploy code.” |
| 2:20–2:40 | Passing test, public README, limitations | “Switch carries the shared conversation and authenticated identities. This is one controlled case; it is not a hostile-code sandbox.” |

Use genuine chronological evidence. Label shortened waiting periods. If the provider or runtime fails, fix it or disclose the failure; do not substitute a mock for a live result.
