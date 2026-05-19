import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppUser } from '@/types';

export type AdminEventType =
  | 'USER_INVITED'
  | 'USER_DELETED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'ROLE_CHANGED'
  | 'ACCESS_UPDATED'
  | 'CHANNEL_CONNECTED'
  | 'CHANNEL_UPDATED'
  | 'CHANNEL_DISCONNECTED'
  | 'PIPELINE_MAPPED'
  | 'PIPELINE_UNMAPPED'
  | 'BRAND_CONTEXT_UPDATED'
  | 'BRAND_CONTEXT_DELETED';

export type AdminTargetKind = 'user' | 'channel' | 'brand_pipeline' | 'brand_context';

// Best-effort: never throws, never blocks the actual admin action. If logging
// fails (e.g. table missing in a stale dev project) we log to stderr and move
// on — the admin action itself has already succeeded.
export async function logAdminEvent(
  supabase: SupabaseClient,
  actor: Pick<AppUser, 'id' | 'name' | 'email'>,
  eventType: AdminEventType,
  targetKind: AdminTargetKind,
  targetId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any> = {}
): Promise<void> {
  try {
    await supabase.from('admin_events').insert({
      actor_user_id: actor.id,
      actor_name: actor.name,
      actor_email: actor.email,
      event_type: eventType,
      target_kind: targetKind,
      target_id: targetId,
      metadata,
    });
  } catch (err) {
    console.error('[admin-events] logAdminEvent failed:', err);
  }
}
