import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConversationMode } from '@/types';

// Returns the mode a freshly-created conversation should start with for a
// given brand. Defaults to 'AI' when the brand has no brand_settings row —
// matches the historical behaviour before this setting existed.
export async function getBrandDefaultMode(
  supabase: SupabaseClient,
  brand: string,
): Promise<ConversationMode> {
  const { data } = await supabase
    .from('brand_settings')
    .select('default_mode')
    .eq('brand', brand)
    .maybeSingle();
  const mode = data?.default_mode as ConversationMode | undefined;
  return mode === 'HUMAN' ? 'HUMAN' : 'AI';
}
