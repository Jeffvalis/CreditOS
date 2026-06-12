import crypto from 'crypto';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error('PAYSTACK_SECRET_KEY is not set in environment variables.');
  }
  return key;
}

/**
 * Create a Transfer Recipient on Paystack.
 * Docs: https://paystack.com/docs/api/transfer-recipient/#create
 */
export async function createTransferRecipient(params: {
  name: string;
  accountNumber: string;
  bankCode: string;
}): Promise<{ recipientCode: string; status: boolean; message: string }> {
  const res = await fetch(`${PAYSTACK_BASE_URL}/transferrecipient`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'nuban',
      name: params.name,
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      currency: 'NGN',
    }),
  });

  const data = await res.json() as any;
  return {
    recipientCode: data?.data?.recipient_code || '',
    status: data?.status || false,
    message: data?.message || 'Unknown error',
  };
}

/**
 * Initiate a Transfer (Disbursement) via Paystack.
 * Docs: https://paystack.com/docs/api/transfer/#initiate
 */
export async function initiateTransfer(params: {
  amount: number; // in kobo (NGN * 100)
  recipientCode: string;
  reason: string;
  reference?: string;
}): Promise<{ transferCode: string; status: boolean; message: string; reference: string }> {
  const reference = params.reference || `txn_${crypto.randomUUID()}`;

  const res = await fetch(`${PAYSTACK_BASE_URL}/transfer`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      source: 'balance',
      amount: params.amount,
      recipient: params.recipientCode,
      reason: params.reason,
      reference,
    }),
  });

  const data = await res.json() as any;
  return {
    transferCode: data?.data?.transfer_code || '',
    status: data?.status || false,
    message: data?.message || 'Unknown error',
    reference: data?.data?.reference || reference,
  };
}

/**
 * Charge a tokenized card (auto-debit) via Paystack.
 * Docs: https://paystack.com/docs/api/transaction/#charge-authorization
 */
export async function chargeAuthorization(params: {
  amount: number; // in kobo (NGN * 100)
  email: string;
  authorizationCode: string;
  reference?: string;
}): Promise<{ status: boolean; gatewayResponse: string; reference: string; message: string }> {
  const reference = params.reference || `chg_${crypto.randomUUID()}`;

  const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/charge_authorization`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getPaystackSecretKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amount,
      email: params.email,
      authorization_code: params.authorizationCode,
      reference,
    }),
  });

  const data = await res.json() as any;
  return {
    status: data?.data?.status === 'success',
    gatewayResponse: data?.data?.gateway_response || data?.message || 'Unknown',
    reference: data?.data?.reference || reference,
    message: data?.message || 'Unknown error',
  };
}
