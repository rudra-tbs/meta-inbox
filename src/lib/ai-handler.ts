import type { SupabaseClient } from '@supabase/supabase-js';
import type { Conversation, QualificationData } from '@/types';
import { SYSTEM_PROMPT } from '@/lib/system-prompt';
import { callOpenRouter } from '@/lib/openrouter';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}


export async function handleAIResponse(
  supabase: SupabaseClient,
  conversation: Conversation,
  inboundMessage: string
): Promise<void> {
  // Fetch last 20 messages
  const { data: history } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('created_at', { ascending: true })
    .limit(20);

  // Build OpenRouter messages
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];

  // Inject a context note for everything already known so the AI never re-asks
  const known: string[] = [];
  if (conversation.contact_name) known.push(`Name: ${conversation.contact_name}`);
  if (conversation.city) known.push(`City: ${conversation.city}`);
  if (conversation.wedding_date) known.push(`Wedding date: ${conversation.wedding_date}`);
  if (conversation.guest_count) known.push(`Guest count: ${conversation.guest_count}`);
  if (conversation.budget_range) known.push(`Budget: ${conversation.budget_range}`);
  if (conversation.service_type) known.push(`Service type: ${conversation.service_type}`);
  if (known.length > 0) {
    messages.push({
      role: 'system',
      content: `Already collected from this lead — do NOT ask for these again: ${known.join('. ')}.`,
    });
  }

  if (history) {
    for (const msg of history) {
      if (msg.sender === 'LEAD') {
        messages.push({ role: 'user', content: msg.content });
      } else {
        messages.push({ role: 'assistant', content: msg.content });
      }
    }
  }

  // Add current inbound message only if it isn't already the last item in history
  const lastHistoryMsg = history?.[history.length - 1];
  if (!lastHistoryMsg || lastHistoryMsg.sender !== 'LEAD' || lastHistoryMsg.content !== inboundMessage) {
    messages.push({ role: 'user', content: inboundMessage });
  }

  // Call OpenRouter
  const rawAIResponse = stripThinkingBlocks(await callOpenRouter(messages));

  // ABSTAIN: AI signals it can't answer — hand off to human silently
  if (rawAIResponse.trim() === 'ABSTAIN') {
    console.log(`[AI Handler] ABSTAIN detected for conversation ${conversation.id} — raw: "${rawAIResponse}"`);
    console.log(`[AI Handler] Attempting Supabase update: mode=HUMAN, needs_human_reply=true, manually_set_human=true`);
    const { error: abstainError } = await supabase.from('conversations').update({
      mode: 'HUMAN',
      needs_human_reply: true,
      manually_set_human: true,
      last_human_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);
    if (abstainError) {
      console.error(`[AI Handler] ABSTAIN update FAILED:`, abstainError);
    } else {
      console.log(`[AI Handler] ABSTAIN update succeeded for conversation ${conversation.id}`);
    }
    return;
  }

  // Strip qualification_data block
  // Strategy 1: model used <qualification_data> tags (as instructed)
  const parts = rawAIResponse.split('<qualification_data>');
  // Strategy 2: model appended raw JSON directly without tags — strip from first { onwards
  const cleanText = parts[0].replace(/\{[\s\S]*$/, '').trim();

  const qualMatch = rawAIResponse.match(/<qualification_data>([\s\S]*?)<\/qualification_data>/)
    ?? rawAIResponse.match(/(\{[\s\S]*"brand"[\s\S]*\})/);
  const qualJson = qualMatch ? qualMatch[1].trim() : null;

  let qualData: QualificationData | null = null;
  if (qualJson) {
    try { qualData = JSON.parse(qualJson) as QualificationData; } catch { /* ignore parse errors */ }
  }

  // Detect callback/follow-up phrases in EITHER the AI reply or the lead's inbound message
  const CALLBACK_PHRASES = [
    'will reach out',
    'will get in touch',
    'will contact you',
    'team will call',
    'someone will follow up',
    'planner will reach out',
    'get back to you',
    'arrange a call',
    'schedule a call',
    'book a call',
    'set up a call',
    'arrange a meeting',
    'call me',
    'please call',
    'want a call',
    'need a call',
    'can you call',
    'give me a call',
    'pl arrange',
    'pls call',
  ];
  const lowerClean = cleanText.toLowerCase();
  const lowerInbound = inboundMessage.toLowerCase();
  const triggersCallback = CALLBACK_PHRASES.some(
    (phrase) => lowerClean.includes(phrase) || lowerInbound.includes(phrase)
  );

  console.log('Sending to WhatsApp:', cleanText);

  // Always save the AI reply to DB first, then attempt WhatsApp delivery
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    direction: 'OUTBOUND',
    sender: 'AI',
    sender_user_id: null,
    content: cleanText,
    whatsapp_message_id: null,
    created_at: new Date().toISOString(),
  });

  // Send to WhatsApp (log failure but don't throw — reply is already saved)
  try {
    await sendWhatsAppMessage(conversation.phone_number, cleanText);
  } catch (err) {
    console.error('WhatsApp delivery failed (reply saved to DB):', err);
  }

  // Build conversation updates
  const updates: Record<string, unknown> = {
    is_first_contact: false,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (triggersCallback) {
    updates.callback_required = true;
  }

  // Apply qualification data
  if (qualData) {
    if (qualData.city) updates.city = qualData.city;
    if (qualData.wedding_date) updates.wedding_date = qualData.wedding_date;
    if (qualData.guest_count) updates.guest_count = qualData.guest_count;
    if (qualData.budget_range) updates.budget_range = qualData.budget_range;
    if (qualData.service_type) updates.service_type = qualData.service_type;
    if (qualData.is_qualified) updates.status = 'QUALIFIED';
  }

  await supabase.from('conversations').update(updates).eq('id', conversation.id);
}
