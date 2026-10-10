import type { EntityOffboardRequest } from "../api/types/data-contracts";
import { parseDateOnly } from "../datelib/dateOnly";

export const offboardingOutcomes = ["sold", "donated", "disposed", "recycled", "lost", "custom"] as const;

export function offboardingValidation(data: EntityOffboardRequest): string | null {
  if (!offboardingOutcomes.includes(data.outcome)) return "invalid_outcome";
  if (!parseDateOnly(data.effectiveDate)) return "invalid_date";
  if (data.outcome === "custom" && !data.customReason.trim()) return "reason_required";
  if ([...data.customReason].length > 255 || [...data.notes].length > 1000) return "too_long";
  return null;
}
