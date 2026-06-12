# CreditOS Developer Hub

Welcome to the CreditOS API documentation. This guide provides the core instructions required to securely integrate embedded credit into your checkout flow.

---

## Core Authentication Guide

All API requests to the CreditOS API must be authenticated using Bearer tokens derived from your API keys.

You will be issued two keys:
1. **Public Key (`pk_test_...` / `pk_live_...`)**: Used for frontend integrations and non-sensitive data retrieval. Passed via `X-Lendr-Public-Key`.
2. **Secret Key (`sk_test_...` / `sk_live_...`)**: Used for backend-to-backend communication. This allows you to initiate checkouts, pull risk tiers, and trigger disbursements. Passed via `X-Lendr-Secret-Key`.

### Example Request Header:
```http
POST /v1/checkouts HTTP/1.1
Host: api.creditos.com
Content-Type: application/json
X-Lendr-Secret-Key: sk_live_your_secret_key_here
```

---

## Standardized Error Matrix

CreditOS uses standard HTTP response codes alongside explicit application-level error codes to denote credit scenarios.

| HTTP Status Code | Scenario / Meaning | Action Required |
| :--- | :--- | :--- |
| **200 OK** | Request processed successfully. | Proceed to next step. |
| **201 Created** | A new resource (e.g., Loan, Ledger Entry) was successfully created. | Proceed to next step. |
| **400 Bad Request** | Structural payload issue. A required parameter is missing or malformed. | Check the API documentation and ensure the JSON body is correctly formatted. |
| **401 Unauthorized** | Missing, invalid, or expired API Keys. | Verify that `X-Lendr-Secret-Key` is passed correctly in the headers. |
| **403 Forbidden** | Your API key doesn't have permission to perform this action. | Check your dashboard permissions. |
| **422 Unprocessable Entity** | **Hard Rejection Triggered**. The user failed a credit policy rule (e.g., BVN/NIN mismatch, device fingerprint reuse, or poor bureau score). | Deny credit instantly. Do not retry the request with the same user details. |
| **500 Internal Server Error** | Something went wrong on the CreditOS platform. | Wait a few moments and retry. If the error persists, contact support. |

---

## Webhooks & Event Verification

When asynchronous events occur (e.g., `loan.disbursed`, `payment.failed`), CreditOS sends an HTTP POST request to your configured Webhook URL. 

To ensure the payload is genuinely from CreditOS and hasn't been tampered with, we sign the payload using HMAC-SHA256 and your `WEBHOOK_SECRET`. The signature is passed in the `X-Lendr-Signature` header.

### Verifying Webhooks (TypeScript/Node.js Snippet)

Below is an exact copy-paste code snippet demonstrating how to verify the incoming Webhook signature in a Node.js Express application:

```typescript
import express, { Request, Response } from 'express';
import crypto from 'crypto';

const app = express();
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'your_webhook_secret_here';

// We need the raw body to compute the HMAC signature securely
app.use(express.json({
  verify: (req: any, res: Response, buf: Buffer) => {
    req.rawBody = buf.toString();
  }
}));

app.post('/webhook/creditos', (req: Request, res: Response) => {
  const signature = req.headers['x-lendr-signature'] as string;
  const rawBody = (req as any).rawBody;

  if (!signature || !rawBody) {
    return res.status(400).send('Missing signature or raw body');
  }

  // 1. Compute HMAC-SHA256 using your Webhook Secret
  const expectedSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');

  // 2. Securely compare the computed signature with the header signature
  if (crypto.timingSafeEqual(Buffer.from(expectedSignature, 'hex'), Buffer.from(signature, 'hex'))) {
    console.log('✅ Webhook verified successfully!');
    
    const payload = req.body;
    
    // Process the event based on payload.event
    if (payload.event === 'loan.disbursed') {
       console.log(`Loan ${payload.data.loanId} was disbursed successfully.`);
    }

    // Always return a 200 OK immediately to prevent retries
    return res.status(200).send('Webhook Received');
  } else {
    console.error('❌ Webhook verification failed. Invalid signature.');
    return res.status(401).send('Invalid signature');
  }
});

app.listen(3000, () => console.log('Webhook server running on port 3000'));
```
