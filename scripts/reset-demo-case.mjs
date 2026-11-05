import { access, copyFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRootArgument(argv) {
  const index = argv.indexOf("--root");
  if (index === -1 || !argv[index + 1]) {
    throw new Error("Usage: reset-demo-case.mjs --root <project-root>");
  }
  return path.resolve(argv[index + 1]);
}

const targetRoot = await realpath(readRootArgument(process.argv.slice(2)));
const destination = path.resolve(targetRoot, "src", "tickets.ts");
const expectedPrefix = `${targetRoot}${path.sep}`;

if (!destination.startsWith(expectedPrefix) || await realpath(destination) !== destination) {
  throw new Error("Refusing to write outside the target project");
}

await access(path.join(targetRoot, "package.json"));
await access(path.join(targetRoot, "tests", "tickets.test.ts"));
await copyFile(path.join(repositoryRoot, "demo", "seeded-bug", "tickets.ts"), destination);

process.stdout.write(`${JSON.stringify({ caseId: "CASE-001", reset: true })}\n`);
