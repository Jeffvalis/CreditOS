import express, { Request, Response } from 'express';
import { LoanRequest, RepaymentRequest } from '@creditos/common';
import { createTransferRecipient, initiateTransfer } from './paystack';
import { WebhookNotifier } from './webhook-notifier';

const app = express();
const PORT = process.env.PORT || 8003;
const webhookNotifier = new WebhookNotifier();

app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`[Payment-Processing Service] ${req.method} ${req.url}`);
  next();
});

// POST /v1/loans
app.post('/v1/loans', (req: Request<{}, {}, LoanRequest>, res: Response) => {
  const { userId, merchantId, offerId, principal, interest, tenor } = req.body;

  if (!userId || !merchantId || !offerId || !principal || !interest || !tenor) {
    return res.status(400).json({
      success: false,
      error: 'Missing required loan parameters: userId, merchantId, offerId, principal, interest, tenor',
    });
  }

  console.log(`[Payment-Processing Service] Processing loan disubursement for userId: ${userId}, offerId: ${offerId}`);

  // Simulate disbursement and repayment schedule creation
  return res.status(201).json({
    success: true,
    loanId: `ln_${Math.random().toString(36).substr(2, 9)}`,
    status: 'DISBURSED',
    disbursedAt: new Date().toISOString(),
    principal,
    interest,
    tenor,
    repaymentSchedule: Array.from({ length: tenor }, (_, i) => {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      return {
        installmentNumber: i + 1,
        dueDate: dueDate.toISOString().split('T')[0],
        amountDue: Math.round((principal + interest) / tenor),
        status: 'UNPAID',
      };
    }),
  });
});

// POST /api/disburse - Real Paystack integration
app.post('/api/disburse', async (req: Request, res: Response) => {
  try {
    const { name, accountNumber, bankCode, amount, reason, merchantWebhookUrl } = req.body;
    if (!name || !accountNumber || !bankCode || !amount || !reason || !merchantWebhookUrl) {
      return res.status(400).json({ success: false, error: 'Missing required fields: name, accountNumber, bankCode, amount, reason, merchantWebhookUrl' });
    }
    // 1. Create transfer recipient
    const recipientResult = await createTransferRecipient({ name, accountNumber, bankCode });
    if (!recipientResult.status) {
      return res.status(502).json({ success: false, error: `Paystack recipient creation failed: ${recipientResult.message}` });
    }
    // 2. Initiate transfer
    const transferResult = await initiateTransfer({ amount, recipientCode: recipientResult.recipientCode, reason });
    if (!transferResult.status) {
      return res.status(502).json({ success: false, error: `Paystack transfer failed: ${transferResult.message}` });
    }
    // 3. Fire webhook event loan.disbursed
    const webhookPayload = {
      loanId: `ln_${Math.random().toString(36).substr(2, 9)}`,
      amount,
      recipientCode: recipientResult.recipientCode,
      transferCode: transferResult.transferCode,
    };
    await webhookNotifier.dispatch(merchantWebhookUrl, 'loan.disbursed', webhookPayload);
    return res.status(201).json({ success: true, transfer: transferResult, webhook: 'dispatched' });
  } catch (err: any) {
    console.error('[Payment-Processing] /api/disburse error', err);
    return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  }
});

// POST /v1/repayments
app.post('/v1/repayments', (req: Request<{}, {}, RepaymentRequest>, res: Response) => {
  const { loanId, amount, paymentMethod, transactionReference } = req.body;

  if (!loanId || !amount || !paymentMethod || !transactionReference) {
    return res.status(400).json({
      success: false,
      error: 'Missing required repayment parameters: loanId, amount, paymentMethod, transactionReference',
    });
  }

  console.log(`[Payment-Processing Service] Processing repayment for loanId: ${loanId}, amount: ${amount}`);

  return res.status(200).json({
    success: true,
    repaymentId: `rep_${Math.random().toString(36).substr(2, 9)}`,
    loanId,
    amountPaid: amount,
    status: 'SUCCESSFUL',
    paymentMethod,
    transactionReference,
    processedAt: new Date().toISOString(),
  });
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'payment-processing' });
});

app.listen(PORT, () => {
  console.log(`[Payment-Processing Service] Running on port ${PORT}`);
});
