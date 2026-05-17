import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, QualificationData, Brand } from '@/types';
import { SYSTEM_PROMPT } from '@/lib/system-prompt';
import { callOpenRouter } from '@/lib/openrouter';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { findOrCreateContact, updateContactFromQualification } from '@/lib/contact-merge';

function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

export async function handleAIResponse(
  supabase: SupabaseClient,
  conversation: Conversation,
  inboundMessage: string
): Promise<void> {
  // Ensure the conversation has a contact linked
  let contactId = conversation.contact_id;
  if (!contactId) {
    const contact = await findOrCreateContact(supabase, conversation.brand as Brand, {
      name: conversation.contact_name,
      phone: conversation.channel === 'WA' ? conversation.phone_number : null,
      instagramId: conversation.channel === 'IG' ? conversation.instagram_id : null,
    });
    contactId = contact.id;
    await supabase
      .from('conversations')
      .update({ contact_id: contactId })
      .eq('id', conversation.id);
  }

  // Fetch contact for context
  const { data: contactRow } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();

  // Fetch last 20 messages
  const { data: history } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(20);

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  const known: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contactRow as any;
  if (c?.name) known.push(`Name: ${c.name}`);
  if (c?.city) known.push(`City: ${c.city}`);
  if (c?.wedding_date) known.push(`Wedding date: ${c.wedding_date}`);
  if (c?.guest_count) known.push(`Guest count: ${c.guest_count}`);
  if (c?.budget_range) known.push(`Budget: ${c.budget_range}`);
  if (c?.service_type) known.push(`Service type: ${c.service_type}`);
  if (known.length > 0) {
    messages.push({
      role: 'system',
      content: `Already collected from this lead — do NOT ask for these again: ${known.join('. ')}.`,
    });
  }

  if (history) {
    for (const msg of history) {
      messages.push({
        role: msg.sender === 'LEAD' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
  }

  const lastHistoryMsg = history?.[history.length - 1];
  if (!lastHistoryMsg || lastHistoryMsg.sender !== 'LEAD' || lastHistoryMsg.content !== inboundMessage) {
    messages.push({ role: 'user', content: inboundMessage });
  }

  const rawAIResponse = stripThinkingBlocks(await callOpenRouter(messages));

  // ABSTAIN: silently hand off to human
  if (rawAIResponse.trim() === 'ABSTAIN') {
    console.log(`[AI Handler] ABSTAIN for conversation ${conversation.id} — switching to HUMAN`);
    await supabase
      .from('conversations')
      .update({
        mode: 'HUMAN',
        needs_human_reply: true,
        manually_set_human: true,
        last_human_message_at: new Date().toISOString(),
        suggested_reply: null,
        suggested_reply_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);
    return;
  }

  // Strip qualification block
  const parts = rawAIResponse.split('<qualification_data>');
  const cleanText = parts[0].replace(/\{[\s\S]*$/, '').trim();

  const qualMatch =
    rawAIResponse.match(/<qualification_data>([\s\S]*?)<\/qualification_data>/) ??
    rawAIResponse.match(/(\{[\s\S]*"brand"[\s\S]*\})/);
  const qualJson = qualMatch ? qualMatch[1].trim() : null;

  let qualData: QualificationData | null = null;
  if (qualJson) {
    try {
      qualData = JSON.parse(qualJson) as QualificationData;
    } catch {
      /* ignore */
    }
  }

  // Callback phrase detection (both directions)
  const CALLBACK_PHRASES = [
    'will reach out', 'will get in touch', 'will contact you', 'team will call',
    'someone will follow up', 'planner will reach out', 'get back to you',
    'arrange a call', 'schedule a call', 'book a call', 'set up a call',
    'arrange a meeting', 'call me', 'please call', 'want a call', 'need a call',
    'can you call', 'give me a call', 'pl arrange', 'pls call',
  ];
  const lowerClean = cleanText.toLowerCase();
  const lowerInbound = inboundMessage.toLowerCase();
  const triggersCallback = CALLBACK_PHRASES.some(
    (phrase) => lowerClean.includes(phrase) || lowerInbound.includes(phrase)
  );

  console.log(`[AI Handler] conv=${conversation.id} mode=${conversation.mode} — generated reply`);

  // Push qualification → contacts (may trigger merge)
  let finalContactId = contactId;
  if (qualData) {
    finalContactId = await updateContactFromQualification(
      supabase,
      contactId,
      conversation.brand as Brand,
      {
        city: qualData.city,
        wedding_date: qualData.wedding_date,
        guest_count: qualData.guest_count,
        budget_range: qualData.budget_range,
        service_type: qualData.service_type,
        instagram_id: qualData.instagram_id,
        phone: qualData.phone,
      }
    );
  }

  if (conversation.mode === 'HUMAN') {
    // Save as suggestion — DO NOT send, DO NOT insert as AI message
    const updates: Record<string, unknown> = {
      suggested_reply: cleanText,
      suggested_reply_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (triggersCallback) updates.callback_required = true;
    if (qualData?.is_qualified) updates.status = 'QUALIFIED';
    if (finalContactId !== contactId) updates.contact_id = finalContactId;
    await supabase.from('conversations').update(updates).eq('id', conversation.id);
    return;
  }

  // AI mode — send the reply
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    direction: 'OUTBOUND',
    sender: 'AI',
    sender_user_id: null,
    content: cleanText,
    whatsapp_message_id: null,
    created_at: new Date().toISOString(),
  });

  try {
    await sendWhatsAppMessage(conversation.phone_number, cleanText);
  } catch (err) {
    console.error('WhatsApp delivery failed (reply saved to DB):', err);
  }

  const updates: Record<string, unknown> = {
    is_first_contact: false,
    last_message_at: new Date().toISOString(),
    suggested_reply: null,
    suggested_reply_at: null,
    updated_at: new Date().toISOString(),
  };
  if (triggersCallback) updates.callback_required = true;
  if (qualData?.is_qualified) updates.status = 'QUALIFIED';
  if (finalContactId !== contactId) updates.contact_id = finalContactId;

  await supabase.from('conversations').update(updates).eq('id', conversation.id);
}
