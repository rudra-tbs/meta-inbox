// Heuristic 0–100 score. Caller passes whatever it knows; missing fields are
// treated as zero. The score is computed every time conversations are fetched
// so it stays in sync with the latest contact data without needing a job.
interface ScoreInput {
  budget_range?: string | null;
  wedding_date?: string | null;
  guest_count?: string | null;
  service_type?: string | null;
  city?: string | null;
  inbound_count?: number;
}

function parseFirstNumber(s: string | null | undefined): number {
  if (!s) return 0;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0]) : 0;
}

function monthsUntil(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/(\d+)(st|nd|rd|th)/, '$1');
  const d = new Date(cleaned);
  if (isNaN(d.getTime())) return null;
  const diffMs = d.getTime() - Date.now();
  return diffMs / (1000 * 60 * 60 * 24 * 30);
}

export function computeLeadScore(input: ScoreInput): number {
  let score = 0;

  // Has budget (any) +15, big budget (>20L) +10
  const budget = parseFirstNumber(input.budget_range);
  if (budget > 0) score += 15;
  if (budget >= 20) score += 10;

  // Wedding date proximity: within 6 months +30, within 12 +15
  const months = monthsUntil(input.wedding_date);
  if (months !== null) {
    if (months >= 0 && months <= 6) score += 30;
    else if (months > 6 && months <= 12) score += 15;
    else if (months > 0) score += 5;
  }

  // Guests
  const guests = parseFirstNumber(input.guest_count);
  if (guests >= 100) score += 15;
  else if (guests > 0) score += 5;

  // Service type specified
  if (input.service_type) score += 10;

  // City known
  if (input.city) score += 5;

  // Engagement: inbound message count
  if (input.inbound_count && input.inbound_count >= 5) score += 10;
  else if (input.inbound_count && input.inbound_count >= 2) score += 5;

  return Math.min(100, score);
}
