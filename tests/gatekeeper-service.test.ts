import { spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GatekeeperService } from "../src/gatekeeper/service.js";
import type { SwitchMessageEvent } from "../src/switch/protocol.js";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "releaseroom-service-"));
  roots.push(root);
  for (const entry of ["src", "tests/tickets.test.ts", "harness", "package.json", "package-lock.json", "tsconfig.json", ".gitignore", ".gitattributes"])
    await cp(path.resolve(entry), path.join(root, entry), { recursive: true });
  await symlink(path.resolve("node_modules"), path.join(root, "node_modules"), "junction");
  await writeFile(path.join(root, "src/tickets.ts"), await readFile("demo/seeded-bug/tickets.ts"));
  for (const args of [["init", "-q"], ["config", "core.autocrlf", "false"], ["config", "user.email", "test@example.invalid"], ["config", "user.name", "Test"], ["add", "."], ["commit", "-qm", "seeded baseline"]]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }
  const messages: string[] = [];
  const service = await GatekeeperService.open({ repositoryRoot: root, humanId: "human", builderId: "builder", roomId: "room", postMessage: async (_room, content) => { messages.push(content); } });
  const fix = () => cp(path.resolve("src/tickets.ts"), path.join(root, "src/tickets.ts"));
  const send = (content: string, senderId = "builder", messageId = crypto.randomUUID()) => service.handleEvent({ type: "message", roomId: "room", messageId, senderId, senderName: senderId, senderKind: senderId === "human" ? "user" : "agent", content, threadId: null } satisfies SwitchMessageEvent);
  const hash = () => messages.join("\n").match(/approve CASE-001 ([a-f0-9]{64})/)![1];
  return { root, service, messages, fix, send, hash };
}

describe("GatekeeperService", () => {
  it("verifies a real patch and exports only after the configured human approves once", async () => {
    const f = await fixture();
    await f.fix();
    await f.send("verify CASE-001", "intruder");
    expect(f.messages.at(-1)).toContain("builder_required");
    await f.send("verify CASE-001");
    const hash = f.hash();
    await f.send(`approve CASE-001 ${hash}`, "builder");
    expect(f.messages.at(-1)).toContain("sender_is_builder");
    await f.send(`approve CASE-001 ${hash}`, "human", "approval-1");
    const output = path.join(f.root, "artifacts/CASE-001", hash);
    expect(await readFile(path.join(output, "changes.patch"), "utf8")).toContain("ticket.status === status");
    expect(JSON.parse(await readFile(path.join(output, "review.json"), "utf8")).hash).toBe(hash);
    expect(await readFile(path.join(output, "HANDOFF.md"), "utf8")).toContain(hash);
    await f.send(`approve CASE-001 ${hash}`, "human", "approval-1");
    expect(f.messages.filter(m => m.startsWith("Exported"))).toHaveLength(1);
    const restarted = await GatekeeperService.open({ repositoryRoot: f.root, humanId: "human", builderId: "builder", roomId: "room", postMessage: async (_r, c) => { f.messages.push(c); } });
    await restarted.handleEvent({ type: "message", roomId: "room", messageId: "approval-2", senderId: "human", senderName: "Human", senderKind: "user", content: `approve CASE-001 ${hash}`, threadId: null });
    expect(f.messages.filter(m => m.startsWith("Exported"))).toHaveLength(1);
  }, 60000);

  it("invalidates changed diffs, including staged changes, and rejects harness edits", async () => {
    const f = await fixture();
    await f.fix();
    await f.send("verify CASE-001");
    const hash = f.hash();
    await writeFile(path.join(f.root, "src/tickets.ts"), "export const changed = true;\n");
    spawnSync("git", ["add", "src/tickets.ts"], { cwd: f.root });
    await f.send(`approve CASE-001 ${hash}`, "human");
    expect(f.messages.at(-1)).toContain("repository_changed");
    await f.fix();
    await writeFile(path.join(f.root, "tests/tickets.test.ts"), "// bypass\n");
    await f.send("verify CASE-001");
    expect(f.messages.at(-1)).toContain("unexpected_repository_changes");
  }, 60000);

  it("reports failed verification and persists a pause across connection gaps", async () => {
    const f = await fixture();
    await f.send("verify CASE-001");
    expect(f.messages.at(-1)).toContain("verification_failed");
    await f.service.handleEvent({ type: "gap", fromSequence: 1, reason: "expired" });
    await f.fix();
    await f.send("verify CASE-001");
    expect(f.messages.at(-1)).toContain("paused_after_gap");
    const journal = JSON.parse(await readFile(path.join(f.root, ".runtime/journal.json"), "utf8"));
    expect(journal.paused).toBe(true);
  }, 60000);

  it("keeps provider errors visible without posting credential values", async () => {
    const f = await fixture();
    await f.service.handleEvent({ type: "connection_error", error: "provider refused Bearer top-secret" });
    expect(f.messages.at(-1)).toContain("connection_error");
    expect(f.messages.join("\n")).not.toContain("top-secret");
  });
});
