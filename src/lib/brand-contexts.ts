import type { SupabaseClient } from '@supabase/supabase-js';
import { SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from '@/lib/system-prompt';

// Returns the system prompt the AI should use for a given brand. Falls back
// to the hardcoded default when no custom context has been saved for that
// brand yet — so every brand keeps working even before an admin writes
// anything in the Brand contexts settings tab.
//
// In production set STRICT_BRAND_PROMPT=1 to refuse the fallback for live
// brands — the AI handler will surface this as an ABSTAIN-like failure
// instead of replying with generic copy on a brand that should have a
// custom prompt. Always logs a warning when falling back so the gap is
// visible in deployment logs.
export class MissingBrandPromptError extends Error {
  constructor(public brand: string) {
    super(`No brand_contexts row for brand "${brand}" and STRICT_BRAND_PROMPT=1`);
    this.name = 'MissingBrandPromptError';
  }
}

export async function getBrandSystemPrompt(
  supabase: SupabaseClient,
  brand: string
): Promise<string> {
  const { data } = await supabase
    .from('brand_contexts')
    .select('system_prompt')
    .eq('brand', brand)
    .maybeSingle();
  const prompt = data?.system_prompt as string | undefined;
  if (prompt) return prompt;

  console.warn(`[Brand Contexts] No row for brand="${brand}" — using built-in fallback. Add one in /admin → Brand contexts.`);
  if (process.env.STRICT_BRAND_PROMPT === '1') {
    throw new MissingBrandPromptError(brand);
  }
  return DEFAULT_SYSTEM_PROMPT;
}

export { DEFAULT_SYSTEM_PROMPT };
