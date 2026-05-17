import type { SupabaseClient } from '@supabase/supabase-js';

export type EventType =
  | 'MODE_CHANGED'
  | 'ASSIGNED'
  | 'PUSHED_TO_CRM'
  | 'SNOOZED'
  | 'UNSNOOZED'
  | 'TAG_ADDED'
  | 'TAG_REMOVED'
  | 'NOTE_UPDATED'
  | 'ABSTAIN'
  | 'CALLBACK_DETECTED'
  | 'CONTACT_MERGED';

export async function logEvent(
  supabase: SupabaseClient,
  conversationId: string,
  eventType: EventType,
  opts: {
    actorUserId?: string | null;
    actorName?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
  } = {}
): Promise<void> {
  try {
    await supabase.from('conversation_events').insert({
      conversation_id: conversationId,
      actor_user_id: opts.actorUserId ?? null,
      actor_name: opts.actorName ?? null,
      event_type: eventType,
      metadata: opts.metadata ?? {},
    });
  } catch (err) {
    console.error('[Activity] logEvent failed:', err);
  }
}
