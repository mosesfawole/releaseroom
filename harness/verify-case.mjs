import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
  await readFile(path.join(repositoryRoot, "harness", "manifest.json"), "utf8"),
);

function readRootArgument(argv) {
  const index = argv.indexOf("--root");
  if (index === -1 || !argv[index + 1]) {
    throw new Error("Usage: verify-case.mjs --root <project-root>");
  }
  return path.resolve(argv[index + 1]);
}

function writeResult(result, exitCode) {
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = exitCode;
}

const targetRoot = await realpath(readRootArgument(process.argv.slice(2)));

for (const [relativePath, expectedHash] of Object.entries(manifest.protectedFiles)) {
  const absolutePath = path.resolve(targetRoot, relativePath);
  if (!absolutePath.startsWith(`${targetRoot}${path.sep}`)) {
    writeResult({ caseId: manifest.caseId, passed: false, error: "protected_path_invalid" }, 2);
    process.exit();
  }

  const actualHash = createHash("sha256")
    .update(await readFile(absolutePath))
    .digest("hex");
  if (actualHash !== expectedHash) {
    writeResult(
      {
        caseId: manifest.caseId,
        passed: false,
        error: "protected_file_changed",
        path: relativePath,
      },
      2,
    );
    process.exit();
  }
}

const verification = spawnSync(
  process.execPath,
  [path.join(targetRoot, "node_modules", "vitest", "vitest.mjs"), "run", "tests/tickets.test.ts"],
  {
  cwd: targetRoot,
  encoding: "utf8",
  env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
  },
);

const exitCode = verification.status ?? 1;
writeResult(
  {
    caseId: manifest.caseId,
    passed: exitCode === 0,
    command: "npm test -- tests/tickets.test.ts",
    exitCode,
    stdout: verification.stdout,
    stderr: verification.stderr,
    error: verification.error?.message,
  },
  exitCode === 0 ? 0 : 1,
);
