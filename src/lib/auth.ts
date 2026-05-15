import { createServerClient as createSupabaseServer } from '@/lib/supabase';
import type { AppUser } from '@/types';

export async function getUserByAuthId(authId: string): Promise<AppUser | null> {
  const supabase = createSupabaseServer();
  const { data } = await supabase.from('users').select('*').eq('auth_id', authId).maybeSingle();
  return data ?? null;
}

// Returns null for admins (no filter), or a filter object for agents
export async function getConversationFilter(userId: string) {
  const supabase = createSupabaseServer();
  const { data: user } = await supabase.from('users').select('role').eq('id', userId).single();
  if (!user || user.role === 'ADMIN') return null;

  const { data: access } = await supabase
    .from('user_access')
    .select('brand, channel')
    .eq('user_id', userId);

  return {
    allowedBrandChannels: access ?? [],
    userId,
  };
}
