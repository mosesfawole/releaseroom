export type Command = { type: "verify"; caseId: "CASE-001" } | { type: "approve"; caseId: "CASE-001"; hash: string };

export function parseCommand(content: string): Command | null {
  if (content.startsWith("@release-gatekeeper ")) content = content.slice("@release-gatekeeper ".length);
  if (content === "verify CASE-001") return { type: "verify", caseId: "CASE-001" };
  const approval = /^approve CASE-001 ([a-f0-9]{64})$/.exec(content);
  if (approval && approval[0] === content) return { type: "approve", caseId: "CASE-001", hash: approval[1] };
  return null;
}
