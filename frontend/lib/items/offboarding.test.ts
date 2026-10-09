import { describe, expect, test } from "vitest";
import { offboardingOutcomes, offboardingValidation } from "./offboarding";
import type { EntityOffboardRequest } from "../api/types/data-contracts";

const form: EntityOffboardRequest = { outcome: "sold", effectiveDate: "2026-10-09", customReason: "", notes: "" };
describe("offboarding form validation", () => {
  test.each(offboardingOutcomes)("accepts %s", outcome => {
    expect(
      offboardingValidation({ ...form, outcome, customReason: outcome === "custom" ? "Returned" : "" })
    ).toBeNull();
  });
  test("requires a nonblank custom reason", () => {
    expect(offboardingValidation({ ...form, outcome: "custom", customReason: "  " })).toBe("reason_required");
  });
  test.each(["", "2026-02-30", "2026-13-01", "2026-10-09T00:00:00Z"])("rejects invalid date %s", effectiveDate => {
    expect(offboardingValidation({ ...form, effectiveDate })).toBe("invalid_date");
  });
  test("enforces server text limits", () => {
    expect(offboardingValidation({ ...form, notes: "x".repeat(1001) })).toBe("too_long");
    expect(offboardingValidation({ ...form, customReason: "x".repeat(256) })).toBe("too_long");
    expect(offboardingValidation({ ...form, notes: "x".repeat(1000) })).toBeNull();
  });
});
