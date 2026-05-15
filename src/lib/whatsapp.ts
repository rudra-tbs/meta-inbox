export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    const errCode = err?.error?.code;
    const errMsg = err?.error?.message ?? 'Unknown error';
    if (errCode === 190) {
      console.error(`[WhatsApp] Token expired (code 190) — generate a new token at developers.facebook.com`);
    } else {
      console.error(`[WhatsApp] Send failed (code ${errCode}): ${errMsg}`);
    }
    console.error(`[WhatsApp] Full error:`, JSON.stringify(err));
    throw new Error(`WhatsApp send failed: ${errMsg} (code ${errCode})`);
  }
}
