import { describe, expect, it } from "vitest";

import { approveBundle } from "../src/gatekeeper/approvals.js";
import type { ApprovalRequest, ApprovalState } from "../src/gatekeeper/types.js";

const currentHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const staleHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function createState(): ApprovalState {
  return {
    configuredHumanId: "human-1",
    configuredBuilderId: "builder-1",
    currentBundleHashes: { "CASE-001": currentHash },
    processedMessageIds: [],
    exportedBundleHashes: [],
  };
}

function createRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    messageId: "message-1",
    senderId: "human-1",
    caseId: "CASE-001",
    hash: currentHash,
    ...overrides,
  };
}

describe("approveBundle", () => {
  it("accepts the configured human for the exact current bundle hash", () => {
    const state = createState();

    const result = approveBundle(state, createRequest());

    expect(result).toMatchObject({ status: "approved", shouldExport: true });
    expect(result.state.processedMessageIds).toEqual(["message-1"]);
    expect(result.state.exportedBundleHashes).toEqual([currentHash]);
    expect(state.processedMessageIds).toEqual([]);
    expect(state.exportedBundleHashes).toEqual([]);
  });

  it("rejects approval messages sent by the builder identity", () => {
    const result = approveBundle(stateWithNoHistory(), createRequest({ senderId: "builder-1" }));

    expect(result).toMatchObject({
      status: "rejected",
      reason: "sender_is_builder",
      shouldExport: false,
    });
  });

  it("rejects senders other than the configured human", () => {
    const result = approveBundle(stateWithNoHistory(), createRequest({ senderId: "human-2" }));

    expect(result).toMatchObject({
      status: "rejected",
      reason: "sender_not_configured_human",
      shouldExport: false,
    });
  });

  it("rejects a stale bundle hash after the current bundle changes", () => {
    const result = approveBundle(stateWithNoHistory(), createRequest({ hash: staleHash }));

    expect(result).toMatchObject({
      status: "rejected",
      reason: "stale_bundle_hash",
      shouldExport: false,
    });
  });

  it("treats a repeated Switch message ID as an idempotent duplicate", () => {
    const first = approveBundle(stateWithNoHistory(), createRequest());

    const repeated = approveBundle(first.state, createRequest());

    expect(repeated).toMatchObject({
      status: "duplicate",
      reason: "message_already_processed",
      shouldExport: false,
    });
    expect(repeated.state).toEqual(first.state);
  });

  it("does not export an already exported hash again under a new message ID", () => {
    const state = createState();
    state.exportedBundleHashes = [currentHash];

    const result = approveBundle(state, createRequest({ messageId: "message-2" }));

    expect(result).toMatchObject({
      status: "duplicate",
      reason: "bundle_already_exported",
      shouldExport: false,
    });
    expect(result.state.processedMessageIds).toEqual(["message-2"]);
  });
});

function stateWithNoHistory(): ApprovalState {
  return createState();
}
