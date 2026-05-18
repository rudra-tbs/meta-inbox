import crypto from 'crypto';

/**
 * Verifies the X-Hub-Signature-256 header against the raw request body
 * using the Meta App Secret. Returns true if valid.
 *
 * Fails closed when WHATSAPP_APP_SECRET is missing — a misconfigured
 * env var must not turn the webhook into an open endpoint.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error('[Webhook] WHATSAPP_APP_SECRET not set — refusing request');
    return false;
  }
  if (!signature) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}
