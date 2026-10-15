// Copies of alerts sent to team recipients (e.g. the Ads agency) never contain lines that talk
// about the agency / Madalina (proposals for the agency etc.) — Laura only (15.10.2026).
// Campaign names such as "amgads | search_rastatt" are NOT agency remarks and stay.
export const AGENCY_LINE = /agen[țţt]i|agency|m[aă]d[aă]lina|amg\s+ads|gherman/i;

export function teamCopy(text) {
  const kept = String(text).split('\n').filter(l => !AGENCY_LINE.test(l));
  const body = kept.join('\n').trim();
  // nothing useful left (only a header line) -> don't send
  return kept.filter(l => l.trim()).length > 1 ? body : null;
}
