export type VerificationEvidence = {
  caseId: string;
  passed: boolean;
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
};

export type ReviewBundle = {
  caseId: string;
  diff: string;
  verification: VerificationEvidence;
  createdAt: string;
  hash: string;
};

export type ApprovalState = {
  configuredHumanId: string;
  configuredBuilderId: string;
  currentBundleHashes: Record<string, string>;
  processedMessageIds: string[];
  exportedBundleHashes: string[];
};

export type ApprovalRequest = {
  messageId: string;
  senderId: string;
  caseId: string;
  hash: string;
};

export type ApprovalResult = {
  status: "approved" | "rejected" | "duplicate";
  reason?:
    | "sender_is_builder"
    | "sender_not_configured_human"
    | "stale_bundle_hash"
    | "message_already_processed"
    | "bundle_already_exported";
  shouldExport: boolean;
  state: ApprovalState;
};

