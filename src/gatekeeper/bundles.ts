import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import type { ReviewBundle, VerificationEvidence } from "./types.js";

const execFileAsync = promisify(execFile);

export type CreateReviewBundleInput = {
  repositoryRoot: string;
  allowedRepositoryRoot: string;
  caseId: string;
  verification: VerificationEvidence;
  createdAt: string;
};

export async function createReviewBundle(
  input: CreateReviewBundleInput,
): Promise<ReviewBundle> {
  if (!input.verification.passed) {
    throw new Error("verification_not_passed");
  }

  const [repositoryRoot, allowedRepositoryRoot] = await Promise.all([
    realpath(input.repositoryRoot),
    realpath(input.allowedRepositoryRoot),
  ]);
  if (repositoryRoot !== allowedRepositoryRoot) {
    throw new Error("repository_outside_allowed_root");
  }

  const { stdout: diff } = await execFileAsync(
    "git",
    ["diff", "HEAD", "--binary", "--", "src"],
    { cwd: repositoryRoot, encoding: "utf8", windowsHide: true },
  );
  const content = {
    caseId: input.caseId,
    diff,
    verification: input.verification,
    createdAt: input.createdAt,
  };
  const hash = createHash("sha256").update(canonicalJson(content), "utf8").digest("hex");

  return { ...content, hash };
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("bundle_contains_non_json_value");
}
