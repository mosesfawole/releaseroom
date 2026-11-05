import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createReviewBundle } from "../src/gatekeeper/bundles.js";
import type { VerificationEvidence } from "../src/gatekeeper/types.js";

const temporaryRoots: string[] = [];

const passingVerification: VerificationEvidence = {
  caseId: "CASE-001",
  passed: true,
  command: "npm test -- tests/tickets.test.ts",
  exitCode: 0,
  stdout: "1 test passed\n",
  stderr: "",
};

async function createRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "releaseroom-bundle-"));
  temporaryRoots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src", "example.ts"), "export const value = 1;\n");

  for (const args of [
    ["init", "--quiet"],
    ["config", "user.email", "test@example.invalid"],
    ["config", "user.name", "ReleaseRoom Test"],
    ["add", "src/example.ts"],
    ["commit", "--quiet", "--message", "baseline"],
  ]) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
    expect(result.status, result.stderr).toBe(0);
  }

  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("createReviewBundle", () => {
  it("hashes the canonical verified diff with a stable SHA-256 value", async () => {
    const repositoryRoot = await createRepository();
    await writeFile(path.join(repositoryRoot, "src", "example.ts"), "export const value = 2;\n");

    const bundle = await createReviewBundle({
      repositoryRoot,
      allowedRepositoryRoot: repositoryRoot,
      caseId: "CASE-001",
      verification: passingVerification,
      createdAt: "2026-11-05T06:00:00.000Z",
    });

    expect(bundle.diff).toBe(
      "diff --git a/src/example.ts b/src/example.ts\n" +
        "index efeee5d..44439d5 100644\n" +
        "--- a/src/example.ts\n" +
        "+++ b/src/example.ts\n" +
        "@@ -1 +1 @@\n" +
        "-export const value = 1;\n" +
        "+export const value = 2;\n",
    );
    expect(bundle.hash).toBe("2535b221906953341b17d22f0f41d30ad6809fc2bea6846da7ddaa2733aa193d");
  });

  it("rejects a repository path outside the configured repository boundary", async () => {
    const allowedRepositoryRoot = await createRepository();
    const outsideRepositoryRoot = await createRepository();

    await expect(
      createReviewBundle({
        repositoryRoot: outsideRepositoryRoot,
        allowedRepositoryRoot,
        caseId: "CASE-001",
        verification: passingVerification,
        createdAt: "2026-11-05T06:00:00.000Z",
      }),
    ).rejects.toThrow("repository_outside_allowed_root");
  });

  it("rejects verification evidence that did not pass", async () => {
    const repositoryRoot = await createRepository();

    await expect(
      createReviewBundle({
        repositoryRoot,
        allowedRepositoryRoot: repositoryRoot,
        caseId: "CASE-001",
        verification: { ...passingVerification, passed: false, exitCode: 1 },
        createdAt: "2026-11-05T06:00:00.000Z",
      }),
    ).rejects.toThrow("verification_not_passed");
  });
});
