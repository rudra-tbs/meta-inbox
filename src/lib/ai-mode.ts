import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, ConversationMode } from '@/types';

export async function resolveConversation(
  supabase: SupabaseClient,
  phoneNumber: string,
  brand: string,
  channel: string,
  contactName: string | null
): Promise<{ conversation: Conversation; mode: ConversationMode }> {
  // Look up existing conversation
  const { data: existing } = await supabase
    .from('conversations')
    .select('*')
    .eq('phone_number', phoneNumber)
    .eq('brand', brand)
    .eq('channel', channel)
    .maybeSingle();

  if (!existing) {
    console.log(`[AI Mode] New conversation for ${phoneNumber} → creating with mode=AI`);
    const now = new Date().toISOString();
    const { data: created, error } = await supabase
      .from('conversations')
      .insert({
        phone_number: phoneNumber,
        brand,
        channel,
        contact_name: contactName,
        mode: 'AI',
        is_first_contact: true,
        first_contact_at: now,
        last_message_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('*')
      .single();

    if (error || !created) {
      throw new Error(`Failed to create conversation: ${error?.message}`);
    }

    return { conversation: created as Conversation, mode: 'AI' };
  }

  console.log(`[AI Mode] Existing conversation ${existing.id}:`, {
    current_mode: existing.mode,
    manually_set_human: existing.manually_set_human,
    last_human_message_at: existing.last_human_message_at ?? 'null',
  });

  // Resolve mode
  let resolvedMode: ConversationMode;

  if (existing.manually_set_human) {
    resolvedMode = 'HUMAN';
    console.log(`[AI Mode] manually_set_human=true → HUMAN (override)`);
  } else if (!existing.last_human_message_at) {
    resolvedMode = 'AI';
    console.log(`[AI Mode] last_human_message_at is null → AI`);
  } else {
    const lastHuman = new Date(existing.last_human_message_at);
    const now = new Date();
    const daysDiff = (now.getTime() - lastHuman.getTime()) / (1000 * 60 * 60 * 24);
    const windowDays = existing.ai_reactivation_window_days ?? 30;

    console.log(`[AI Mode] Days since last human message: ${daysDiff.toFixed(1)} (window: ${windowDays}d)`);

    if (daysDiff <= windowDays) {
      resolvedMode = 'HUMAN';
      console.log(`[AI Mode] Within window → HUMAN`);
    } else {
      resolvedMode = 'AI';
      console.log(`[AI Mode] Outside window → AI (reactivating)`);
    }
  }

  console.log(`[AI Mode] Decision: ${existing.mode} → ${resolvedMode}`);

  const updates: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (resolvedMode !== existing.mode) {
    updates.mode = resolvedMode;
  }

  if (contactName && !existing.contact_name) {
    updates.contact_name = contactName;
  }

  const { data: updated, error: updateError } = await supabase
    .from('conversations')
    .update(updates)
    .eq('id', existing.id)
    .select('*')
    .single();

  if (updateError || !updated) {
    throw new Error(`Failed to update conversation: ${updateError?.message}`);
  }

  return { conversation: updated as Conversation, mode: resolvedMode };
}
