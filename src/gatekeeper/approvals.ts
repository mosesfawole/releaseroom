import type { ApprovalRequest, ApprovalResult, ApprovalState } from "./types.js";

export function approveBundle(
  state: ApprovalState,
  request: ApprovalRequest,
): ApprovalResult {
  if (state.processedMessageIds.includes(request.messageId)) {
    return duplicate(state, "message_already_processed");
  }

  const processedState: ApprovalState = {
    ...state,
    currentBundleHashes: { ...state.currentBundleHashes },
    processedMessageIds: [...state.processedMessageIds, request.messageId],
    exportedBundleHashes: [...state.exportedBundleHashes],
  };

  if (request.senderId === state.configuredBuilderId) {
    return rejected(processedState, "sender_is_builder");
  }
  if (request.senderId !== state.configuredHumanId) {
    return rejected(processedState, "sender_not_configured_human");
  }
  if (state.currentBundleHashes[request.caseId] !== request.hash) {
    return rejected(processedState, "stale_bundle_hash");
  }
  if (state.exportedBundleHashes.includes(request.hash)) {
    return duplicate(processedState, "bundle_already_exported");
  }

  return {
    status: "approved",
    shouldExport: true,
    state: {
      ...processedState,
      exportedBundleHashes: [...processedState.exportedBundleHashes, request.hash],
    },
  };
}

function rejected(
  state: ApprovalState,
  reason: "sender_is_builder" | "sender_not_configured_human" | "stale_bundle_hash",
): ApprovalResult {
  return { status: "rejected", reason, shouldExport: false, state };
}

function duplicate(
  state: ApprovalState,
  reason: "message_already_processed" | "bundle_already_exported",
): ApprovalResult {
  return { status: "duplicate", reason, shouldExport: false, state };
}
