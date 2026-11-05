# Reproducible demonstration

Prepare an isolated clone with the seeded bug committed, following the README. Keep the original development clone correct and passing. Configure the two agents, identities, room, and local `.env`. Run the built gatekeeper from the demo clone.

1. Show `npm run verify:case` failing on the seeded baseline. Show the filter returning closed tickets when asked for open tickets.
2. In the real Switch-connected room, the human asks `@release-builder`: “CASE-001: selecting open tickets shows closed tickets. Please reproduce it, fix only src/tickets.ts, and request gatekeeper verification.”
3. Observe the genuine builder response and file edit. Do not substitute a scripted fake agent for the recording.
4. Observe the builder's `@release-gatekeeper verify CASE-001` and the gatekeeper's verified hash.
5. Review the local journal's diff and test evidence. Show only the relevant fields; the journal also contains private participant IDs.
6. The human personally posts `@release-gatekeeper approve CASE-001 <hash>`.
7. Show the export notification and `changes.patch`, `review.json`, and `HANDOFF.md`. Show the protected test passing.
8. Optional failure demonstration: after verification, alter the filter again and approve the earlier hash. The service must reject `repository_changed`. Restore the fix, request a new verification, and let the human approve the new hash.

Do not show `.env`, API keys, registration keys, provider configuration, or unredacted participant IDs. Save public evidence only after reviewing it. Record real failures as failures; do not claim a live demo has run until it has.
