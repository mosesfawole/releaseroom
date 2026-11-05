import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/gatekeeper/commands.js";
describe("room commands", () => {
  it("accepts only the exact known case and command grammar", () => {
    expect(parseCommand("verify CASE-001")).toEqual({ type: "verify", caseId: "CASE-001" });
    expect(parseCommand("@release-gatekeeper verify CASE-001")).toEqual({ type: "verify", caseId: "CASE-001" });
    expect(parseCommand(`approve CASE-001 ${"a".repeat(64)}`)?.type).toBe("approve");
    for (const text of ["verify CASE-002", "verify CASE-001\n", " verify CASE-001", "verify CASE-001; ls", `approve CASE-001 ${"a".repeat(64)}\n`, `approve CASE-001 ${"A".repeat(64)}`, "@gatekeeper verify CASE-001"]) expect(parseCommand(text)).toBeNull();
  });
});
