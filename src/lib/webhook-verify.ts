import crypto from 'crypto';

/**
 * Verifies the X-Hub-Signature-256 header against the raw request body
 * using the Meta App Secret. Returns true if valid.
 *
 * If WHATSAPP_APP_SECRET is not set, returns true (dev mode bypass) and
 * logs a warning — never deploy without setting the secret.
 */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.warn('[Webhook] WHATSAPP_APP_SECRET not set — skipping signature check (DEV ONLY)');
    return true;
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
