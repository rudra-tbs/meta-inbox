import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, QualificationData, Brand } from '@/types';
import { callLLM } from '@/lib/llm';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { sendInstagramMessage } from '@/lib/instagram';
import { findOrCreateContact, updateContactFromQualification } from '@/lib/contact-merge';
import { getBrandSystemPrompt, MissingBrandPromptError } from '@/lib/brand-contexts';
import * as Sentry from '@sentry/nextjs';
import { logEvent } from '@/lib/activity';
import { extractCleanText, extractQualData } from '@/lib/ai-response';

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .trim();
}

const CALLBACK_PHRASES = [
  'will reach out', 'will get in touch', 'will contact you', 'team will call',
  'someone will follow up', 'planner will reach out', 'get back to you',
  'arrange a call', 'schedule a call', 'book a call', 'set up a call',
  'arrange a meeting', 'call me', 'please call', 'want a call', 'need a call',
  'can you call', 'give me a call', 'pl arrange', 'pls call',
];

function detectCallback(cleanText: string, inboundMessage: string): boolean {
  const a = cleanText.toLowerCase();
  const b = inboundMessage.toLowerCase();
  return CALLBACK_PHRASES.some((p) => a.includes(p) || b.includes(p));
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

  let systemPrompt: string;
  try {
    systemPrompt = await getBrandSystemPrompt(supabase, conversation.brand);
  } catch (err) {
    if (err instanceof MissingBrandPromptError) {
      // STRICT_BRAND_PROMPT mode: hand off to a human rather than reply with
      // generic copy on a brand that's expected to have its own prompt.
      console.error(`[AI Handler] Strict mode: ${err.message} — abstaining`);
      await supabase
        .from('conversations')
        .update({
          mode: 'HUMAN',
          needs_human_reply: true,
          ai_abstained: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);
      await logEvent(supabase, conversation.id, 'ABSTAIN', { metadata: { reason: 'missing_brand_prompt' } });
      return;
    }
    throw err;
  }
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];

  const known: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = contactRow as any;
  // Prefer the contact record's name, but fall back to the WhatsApp profile
  // name from the conversation — otherwise the AI re-asks "what's your name?"
  // when we already have it from Meta.
  const knownName = c?.name ?? conversation.contact_name;
  if (knownName) known.push(`Name: ${knownName}`);
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

  const rawAIResponse = stripThinkingBlocks(await callLLM(messages));

  // ABSTAIN: silently hand off to human. The ai_abstained flag is the
  // inbox indicator. We deliberately do NOT set manually_set_human or
  // stamp last_human_message_at — those would permanently lock the
  // conversation out of AI reactivation. Reactivation should still
  // happen after the standard 30-day silence window if the lead
  // returns, OR sooner once the RM actually replies (the reply route
  // resets ai_abstained + needs_human_reply + suggested_reply).
  if (rawAIResponse.trim() === 'ABSTAIN') {
    console.log(`[AI Handler] ABSTAIN for conversation ${conversation.id} — switching to HUMAN`);
    await supabase
      .from('conversations')
      .update({
        mode: 'HUMAN',
        needs_human_reply: true,
        ai_abstained: true,
        suggested_reply: null,
        suggested_reply_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);
    await logEvent(supabase, conversation.id, 'ABSTAIN', {});
    return;
  }

  const cleanText = extractCleanText(rawAIResponse);
  const qualData: QualificationData | null = extractQualData(rawAIResponse);
  if (!qualData && /qualification_data/.test(rawAIResponse)) {
    console.warn(`[AI Handler] qual_data parse failed for ${conversation.id}`);
  }

  const triggersCallback = detectCallback(cleanText, inboundMessage);

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
    // Save as suggestion — DO NOT send, DO NOT insert as AI message.
    // Preserve the previous suggestion if the RM hasn't consumed it yet,
    // so a chatty lead's later messages don't blow away the earlier hint.
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (!conversation.suggested_reply) {
      updates.suggested_reply = cleanText;
      updates.suggested_reply_at = new Date().toISOString();
    }
    // callback flag: set only on detection. Cleared on human reply (see reply route).
    if (triggersCallback) updates.callback_required = true;
    if (qualData?.is_qualified) {
      updates.status = 'QUALIFIED';
      updates.needs_human_reply = true;
    }
    if (finalContactId !== contactId) updates.contact_id = finalContactId;
    await supabase.from('conversations').update(updates).eq('id', conversation.id);
    return;
  }

  // AI mode — save as PENDING, send, then mark SENT (or FAILED).
  const { data: insertedMsg } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      direction: 'OUTBOUND',
      sender: 'AI',
      sender_user_id: null,
      content: cleanText,
      whatsapp_message_id: null,
      delivered_status: 'PENDING',
      created_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  let sendOk = false;
  let sendError: string | null = null;
  let waId: string | null = null;
  try {
    if (conversation.channel === 'IG') {
      waId = await sendInstagramMessage(conversation.brand, conversation.phone_number, cleanText);
    } else {
      waId = await sendWhatsAppMessage(conversation.brand, conversation.phone_number, cleanText);
    }
    sendOk = true;
  } catch (err) {
    sendError = err instanceof Error ? err.message : String(err);
    console.error(`${conversation.channel} delivery failed (reply saved to DB):`, err);
    Sentry.captureException(err, {
      tags: { component: 'ai-handler', stage: 'send', channel: conversation.channel, brand: conversation.brand },
      extra: { conversation_id: conversation.id },
    });
  }

  if (insertedMsg?.id) {
    if (sendOk) {
      await supabase
        .from('messages')
        .update({ whatsapp_message_id: waId, delivered_status: 'SENT', send_error: null })
        .eq('id', insertedMsg.id);
    } else {
      await supabase
        .from('messages')
        .update({ delivered_status: 'FAILED', send_error: sendError })
        .eq('id', insertedMsg.id);
    }
  }

  const updates: Record<string, unknown> = {
    is_first_contact: false,
    last_message_at: new Date().toISOString(),
    last_message_preview: cleanText.slice(0, 500),
    // Clear or set callback flag in lockstep with this generation.
    callback_required: triggersCallback,
    suggested_reply: null,
    suggested_reply_at: null,
    updated_at: new Date().toISOString(),
  };
  if (qualData?.is_qualified) {
    // Auto-handoff: once qualified, AI bows out and a planner takes over.
    updates.status = 'QUALIFIED';
    updates.mode = 'HUMAN';
    updates.needs_human_reply = true;
    updates.manually_set_human = true;
    updates.last_human_message_at = new Date().toISOString();
  }
  if (finalContactId !== contactId) updates.contact_id = finalContactId;

  await supabase.from('conversations').update(updates).eq('id', conversation.id);
}
