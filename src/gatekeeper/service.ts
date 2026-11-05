import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { approveBundle } from "./approvals.js";
import { createReviewBundle } from "./bundles.js";
import { parseCommand } from "./commands.js";
import type { ApprovalState, ReviewBundle, VerificationEvidence } from "./types.js";
import type { SwitchEvent, SwitchMessageEvent } from "../switch/protocol.js";

const exec = promisify(execFile);
const evidenceSchema = z.object({ caseId: z.literal("CASE-001"), passed: z.boolean(), command: z.literal("npm test -- tests/tickets.test.ts"), exitCode: z.number().int(), stdout: z.string(), stderr: z.string(), error: z.string().optional() });
const bundleSchema = z.object({ caseId: z.literal("CASE-001"), diff: z.string(), verification: evidenceSchema, createdAt: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/) });
const journalSchema = z.object({
  configuredHumanId: z.string(), configuredBuilderId: z.string(),
  currentBundleHashes: z.record(z.string(), z.string()), processedMessageIds: z.array(z.string()), exportedBundleHashes: z.array(z.string()),
  paused: z.boolean(), bundle: bundleSchema.nullable(), snapshot: z.string().nullable(),
});
type Journal = ApprovalState & { paused: boolean; bundle: ReviewBundle | null; snapshot: string | null };
export type ServiceOptions = {
  repositoryRoot: string; humanId: string; builderId: string; roomId: string;
  postMessage(roomId: string, content: string): Promise<unknown>;
  secrets?: string[];
  recoverGap?: boolean;
};

export function redactError(value: unknown, secrets: string[] = []): string {
  let message = value instanceof Error ? value.message : String(value);
  for (const secret of secrets.filter(Boolean)) message = message.split(secret).join("[redacted]");
  return message.replace(/Bearer\s+[^\s"'<>]+/gi, "Bearer [redacted]").slice(0, 1000);
}

export class GatekeeperService {
  private queue = Promise.resolve();
  private readonly journalPath: string;
  private constructor(private readonly options: ServiceOptions, private state: Journal) {
    this.journalPath = path.join(options.repositoryRoot, ".runtime/journal.json");
  }

  static async open(options: ServiceOptions): Promise<GatekeeperService> {
    if (!options.humanId || !options.builderId || options.humanId === options.builderId) throw new Error("distinct_human_and_builder_required");
    const root = await realpath(options.repositoryRoot);
    const gitRoot = (await exec("git", ["rev-parse", "--show-toplevel"], { cwd: root, windowsHide: true })).stdout.trim();
    if (await realpath(gitRoot) !== root) throw new Error("repository_root_required");
    let state: Journal = { configuredHumanId: options.humanId, configuredBuilderId: options.builderId, currentBundleHashes: {}, processedMessageIds: [], exportedBundleHashes: [], paused: false, bundle: null, snapshot: null };
    try { state = journalSchema.parse(JSON.parse(await readFile(path.join(root, ".runtime/journal.json"), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("invalid_journal", { cause: error }); }
    if (state.configuredHumanId !== options.humanId || state.configuredBuilderId !== options.builderId) throw new Error("journal_identity_mismatch");
    if (options.recoverGap) { state.paused = false; state.bundle = null; state.snapshot = null; state.currentBundleHashes = {}; }
    const service = new GatekeeperService({ ...options, repositoryRoot: root }, state);
    await service.repositorySnapshot();
    await service.save();
    return service;
  }

  handleEvent(event: SwitchEvent): Promise<void> {
    const task = this.queue.then(() => this.process(event));
    this.queue = task.catch(() => {});
    return task;
  }

  async drain(): Promise<void> { await this.queue; }

  private async process(event: SwitchEvent): Promise<void> {
    if (event.type === "gap") {
      this.state.paused = true;
      this.invalidate();
      await this.save();
      await this.post("Paused: connection_gap. Inspect the room history and restart with --recover-gap; a new verification and approval are required.");
      return;
    }
    if (event.type === "connection_error") {
      await this.post(`Status: connection_error: ${redactError(event.error, this.options.secrets)}`);
      return;
    }
    if (event.roomId !== this.options.roomId || this.state.processedMessageIds.includes(event.messageId)) return;
    const command = parseCommand(event.content);
    if (!command) return;
    if (this.state.paused) { await this.post("Rejected: paused_after_gap"); return; }
    try {
      if (command.type === "verify") await this.verify(event);
      else await this.approve(event, command.hash);
    } catch (error) {
      this.invalidate();
      this.markProcessed(event.messageId);
      await this.save();
      await this.post(`Rejected: ${redactError(error, this.options.secrets)}`);
    }
  }

  private async verify(event: SwitchMessageEvent): Promise<void> {
    this.markProcessed(event.messageId);
    if (event.senderId !== this.options.builderId) { await this.save(); await this.post("Rejected: builder_required"); return; }
    this.invalidate();
    await this.save();
    const before = await this.repositorySnapshot();
    let stdout: string;
    try {
      ({ stdout } = await exec(process.execPath, [path.join(this.options.repositoryRoot, "harness/verify-case.mjs"), "--root", this.options.repositoryRoot], { cwd: this.options.repositoryRoot, windowsHide: true, timeout: 60000, maxBuffer: 4 * 1024 * 1024 }));
    } catch (error) {
      const failure = error as { stdout?: string };
      let detail = "";
      try { const evidence = JSON.parse(failure.stdout ?? ""); detail = typeof evidence.error === "string" ? `: ${evidence.error}` : ""; } catch {}
      throw new Error(`verification_failed${detail}`);
    }
    const verification: VerificationEvidence = evidenceSchema.parse(JSON.parse(stdout));
    if (!verification.passed || verification.exitCode !== 0) throw new Error("verification_failed");
    if (await this.repositorySnapshot() !== before) throw new Error("repository_changed_during_verification");
    const bundle = await createReviewBundle({ repositoryRoot: this.options.repositoryRoot, allowedRepositoryRoot: this.options.repositoryRoot, caseId: "CASE-001", verification, createdAt: new Date().toISOString() });
    if (!bundle.diff.trim()) throw new Error("no_patch_to_review; prepare the committed seeded demo baseline first");
    if (await this.repositorySnapshot() !== before) throw new Error("repository_changed_during_verification");
    this.state.bundle = bundle;
    this.state.snapshot = before;
    this.state.currentBundleHashes["CASE-001"] = bundle.hash;
    await this.save();
    await this.post(`Verified CASE-001. Review the patch and test evidence in .runtime/journal.json. The configured human may send exactly:\napprove CASE-001 ${bundle.hash}\nNothing has been exported yet.`);
  }

  private async approve(event: SwitchMessageEvent, hash: string): Promise<void> {
    const result = approveBundle(this.state, { messageId: event.messageId, senderId: event.senderId, caseId: "CASE-001", hash });
    if (!result.shouldExport) {
      this.state = { ...this.state, ...result.state };
      await this.save();
      await this.post(`${result.status}: ${result.reason}`);
      return;
    }
    if (!this.state.bundle || await this.repositorySnapshot() !== this.state.snapshot) throw new Error("repository_changed; request a new verification");
    const bundle = this.state.bundle;
    const parent = path.join(this.options.repositoryRoot, "artifacts/CASE-001");
    const destination = path.join(parent, hash);
    const staging = path.join(parent, `.${hash}.pending`);
    await mkdir(parent, { recursive: true });
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging);
    await writeFile(path.join(staging, "review.json"), JSON.stringify(bundle, null, 2) + "\n");
    await writeFile(path.join(staging, "changes.patch"), bundle.diff);
    await writeFile(path.join(staging, "HANDOFF.md"), `# CASE-001 handoff\n\nBundle: ${hash}\n\nVerified: ${bundle.createdAt}\n\nThe configured human approved this exact bundle in Switch. The fixed regression test passed. This export does not deploy or merge code.\n\nApply changes.patch to the demo's seeded Git baseline. Review review.json for the test output.\n`);
    if (await this.repositorySnapshot() !== this.state.snapshot) { await rm(staging, { recursive: true, force: true }); throw new Error("repository_changed_during_export"); }
    try { await rename(staging, destination); }
    catch (error) {
      // A crash after the atomic rename but before journal persistence is recoverable.
      const existing = JSON.parse(await readFile(path.join(destination, "review.json"), "utf8"));
      if (JSON.stringify(existing) !== JSON.stringify(bundle)) throw error;
      await rm(staging, { recursive: true, force: true });
    }
    this.state = { ...this.state, ...result.state };
    await this.save();
    await this.post(`Exported CASE-001: artifacts/CASE-001/${hash}/ (review.json, changes.patch, HANDOFF.md). Human approval recorded; no deployment performed.`);
  }

  private async repositorySnapshot(): Promise<string> {
    const cwd = this.options.repositoryRoot;
    const git = async (args: string[]) => (await exec("git", args, { cwd, windowsHide: true, maxBuffer: 4 * 1024 * 1024 })).stdout;
    const changed = (await git(["diff", "HEAD", "--name-only", "-z"])).split("\0").filter(Boolean);
    const untracked = (await git(["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean);
    if (changed.some(p => p !== "src/tickets.ts") || untracked.length) throw new Error("unexpected_repository_changes; only src/tickets.ts may change");
    const manifest = z.object({ caseId: z.literal("CASE-001"), protectedFiles: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)) }).parse(JSON.parse(await readFile(path.join(cwd, "harness/manifest.json"), "utf8")));
    for (const name of ["tests/tickets.test.ts", "harness/verify-case.mjs", "package.json", "package-lock.json", "tsconfig.json"]) {
      const protectedPath = path.join(cwd, name);
      if (await realpath(protectedPath) !== protectedPath || createHash("sha256").update(await readFile(protectedPath)).digest("hex") !== manifest.protectedFiles[name]) throw new Error("protected_file_changed");
    }
    const file = path.join(cwd, "src/tickets.ts");
    if (await realpath(file) !== file) throw new Error("ticket_path_must_not_be_symlink");
    const hash = createHash("sha256");
    hash.update(await git(["rev-parse", "HEAD"]));
    hash.update(await git(["diff", "HEAD", "--binary", "--", "src/tickets.ts"]));
    hash.update(await readFile(file));
    return hash.digest("hex");
  }

  private invalidate(): void { this.state.bundle = null; this.state.snapshot = null; this.state.currentBundleHashes = {}; }
  private markProcessed(id: string): void { if (!this.state.processedMessageIds.includes(id)) this.state.processedMessageIds.push(id); }
  private async save(): Promise<void> {
    await mkdir(path.dirname(this.journalPath), { recursive: true });
    await writeFile(`${this.journalPath}.tmp`, JSON.stringify(this.state, null, 2) + "\n", { mode: 0o600 });
    await rename(`${this.journalPath}.tmp`, this.journalPath);
  }
  private async post(content: string): Promise<void> {
    await this.options.postMessage(this.options.roomId, redactError(content, this.options.secrets));
  }
}
