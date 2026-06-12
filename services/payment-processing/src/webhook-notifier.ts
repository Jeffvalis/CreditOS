import crypto from 'crypto';

export interface WebhookPayload {
  event_id: string;
  event: string;
  data: Record<string, any>;
  timestamp: string;
}

/**
 * WebhookNotifier: Signs and dispatches outbound webhook events to merchant endpoints.
 * - Signs payloads using HMAC-SHA256 with a shared WEBHOOK_SECRET.
 * - Attaches the signature in the `X-Lendr-Signature` header.
 * - Includes a unique `event_id` (UUID) for merchant-side idempotency.
 */
export class WebhookNotifier {
  private secret: string;

  constructor(secret?: string) {
    this.secret = secret || process.env.WEBHOOK_SECRET || 'default-webhook-secret-change-in-prod';
  }

  /**
   * Compute HMAC-SHA256 signature for a given payload string.
   */
  sign(payloadString: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(payloadString)
      .digest('hex');
  }

  /**
   * Verify an HMAC-SHA256 signature against a given payload string.
   */
  verify(payloadString: string, signature: string): boolean {
    const computed = this.sign(payloadString);
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(signature, 'hex')
    );
  }

  /**
   * Build and dispatch a signed webhook to the merchant's configured URL.
   * Returns the payload and signature for logging/testing purposes.
   */
  async dispatch(
    merchantWebhookUrl: string,
    event: string,
    data: Record<string, any>
  ): Promise<{ payload: WebhookPayload; signature: string; delivered: boolean; statusCode?: number }> {
    const payload: WebhookPayload = {
      event_id: crypto.randomUUID(),
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    const bodyString = JSON.stringify(payload);
    const signature = this.sign(bodyString);

    try {
      const res = await fetch(merchantWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Lendr-Signature': signature,
        },
        body: bodyString,
      });

      console.log(`[WebhookNotifier] Dispatched ${event} to ${merchantWebhookUrl} -> ${res.status}`);

      return {
        payload,
        signature,
        delivered: res.ok,
        statusCode: res.status,
      };
    } catch (error: any) {
      console.error(`[WebhookNotifier] Failed to deliver ${event} to ${merchantWebhookUrl}:`, error.message);
      return {
        payload,
        signature,
        delivered: false,
      };
    }
  }
}
