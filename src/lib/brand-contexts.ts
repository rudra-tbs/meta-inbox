import type { SupabaseClient } from '@supabase/supabase-js';
import { SYSTEM_PROMPT as DEFAULT_SYSTEM_PROMPT } from '@/lib/system-prompt';

// Returns the system prompt the AI should use for a given brand. Falls back
// to the hardcoded default when no custom context has been saved for that
// brand yet — so every brand keeps working even before an admin writes
// anything in the Brand contexts settings tab.
export async function getBrandSystemPrompt(
  supabase: SupabaseClient,
  brand: string
): Promise<string> {
  const { data } = await supabase
    .from('brand_contexts')
    .select('system_prompt')
    .eq('brand', brand)
    .maybeSingle();
  return (data?.system_prompt as string | undefined) ?? DEFAULT_SYSTEM_PROMPT;
}

export { DEFAULT_SYSTEM_PROMPT };
