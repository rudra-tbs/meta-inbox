import type { QualificationData } from '@/types';

// Strip the qualification_data block (and anything after it) from the clean
// reply that gets sent to the lead. We rely on the explicit tag boundary so
// conversational text containing { } is not corrupted. The fallback handles
// the rare case where the LLM forgot the wrapping tags but still appended
// the JSON payload at the end.
export function extractCleanText(raw: string): string {
  const tagSplit = raw.split('<qualification_data>');
  if (tagSplit.length > 1) return tagSplit[0].trim();
  // No tag — strip a trailing JSON object only if it sits at the very end and
  // looks like a qualification payload (anchored on is_qualified since we
  // dropped the "brand" field from the schema).
  const trailing = raw.match(/\s*(\{[\s\S]*"is_qualified"[\s\S]*\})\s*$/);
  if (trailing) return raw.slice(0, raw.length - trailing[0].length).trim();
  return raw.trim();
}

// Pulls the qualification JSON from a raw assistant reply. Tries the tagged
// form first, then the loose trailing-JSON form. Returns null when the LLM
// abstained, errored, or produced nothing parseable.
export function extractQualData(raw: string): QualificationData | null {
  const match =
    raw.match(/<qualification_data>([\s\S]*?)<\/qualification_data>/) ??
    raw.match(/(\{[\s\S]*"is_qualified"[\s\S]*\})/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim()) as QualificationData;
  } catch {
    return null;
  }
}
