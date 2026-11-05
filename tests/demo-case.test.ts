import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "releaseroom-case-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "tests"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    await readFile(path.join(repositoryRoot, "package.json")),
  );
  await writeFile(
    path.join(root, "tsconfig.json"),
    await readFile(path.join(repositoryRoot, "tsconfig.json")),
  );
  await writeFile(
    path.join(root, "src", "tickets.ts"),
    await readFile(path.join(repositoryRoot, "src", "tickets.ts")),
  );
  await writeFile(
    path.join(root, "tests", "tickets.test.ts"),
    await readFile(path.join(repositoryRoot, "tests", "tickets.test.ts")),
  );
  await symlink(path.join(repositoryRoot, "node_modules"), path.join(root, "node_modules"), "junction");
  return root;
}

function runScript(script: string, root: string) {
  return spawnSync(process.execPath, [path.join(repositoryRoot, script), "--root", root], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
}

describe("the deterministic demo case", () => {
  it("resets to a failing bug and verifies the restored fix", async () => {
    const root = await createFixture();

    const reset = runScript("scripts/reset-demo-case.mjs", root);
    expect(reset.status).toBe(0);

    const failing = runScript("harness/verify-case.mjs", root);
    expect(failing.status).toBe(1);
    expect(JSON.parse(failing.stdout)).toMatchObject({ caseId: "CASE-001", passed: false });

    await writeFile(
      path.join(root, "src", "tickets.ts"),
      await readFile(path.join(repositoryRoot, "src", "tickets.ts")),
    );

    const passing = runScript("harness/verify-case.mjs", root);
    expect(passing.status).toBe(0);
    expect(JSON.parse(passing.stdout)).toMatchObject({ caseId: "CASE-001", passed: true });
  });

  it("rejects a changed protected regression test", async () => {
    const root = await createFixture();
    const testPath = path.join(root, "tests", "tickets.test.ts");
    await writeFile(testPath, `${await readFile(testPath, "utf8")}\n// untrusted change\n`);

    const result = runScript("harness/verify-case.mjs", root);

    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({
      caseId: "CASE-001",
      passed: false,
      error: "protected_file_changed",
    });
  });
});
