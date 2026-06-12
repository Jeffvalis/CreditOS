import Redis from 'ioredis';
import { extendedPrisma } from './ledger-middleware';

export class CreditOSEventListener {
  private redis: Redis;
  private streamName = 'creditos:events';
  private groupName = 'core-ledger-group';
  private consumerName = `consumer-${Math.random().toString(36).substring(7)}`;

  constructor() {
    // Connect to local Redis (fallback to localhost:6379)
    this.redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  }

  async init() {
    try {
      // Create Consumer Group. We use '$' to consume only new messages, 
      // or '0' to consume all. Here we use '0' but MKSTREAM creates the stream if it doesn't exist.
      await this.redis.xgroup('CREATE', this.streamName, this.groupName, '$', 'MKSTREAM');
      console.log(`[EventListener] Consumer group ${this.groupName} created/verified`);
    } catch (err: any) {
      if (!err.message.includes('BUSYGROUP')) {
        console.error('[EventListener] Failed to create consumer group', err);
      }
    }
  }

  async startListening() {
    console.log(`[EventListener] Starting to listen for events as ${this.consumerName}`);
    while (true) {
      try {
        // Block for 5 seconds waiting for new events in the group
        const results = await this.redis.xreadgroup(
          'GROUP', this.groupName, this.consumerName,
          'BLOCK', 5000,
          'STREAMS', this.streamName, '>'
        );

        if (results) {
          const [stream, messages] = results[0] as any;
          for (const message of messages) {
            const [messageId, fields] = message as any;
            
            // Reconstruct the event payload from the Redis Stream fields array
            const eventPayload: any = {};
            for (let i = 0; i < fields.length; i += 2) {
              eventPayload[fields[i]] = fields[i + 1];
            }

            console.log(`[EventListener] Processing message ${messageId}:`, eventPayload.event);
            
            try {
              await this.processEvent(eventPayload);
              // Acknowledge the message if processed successfully
              await this.redis.xack(this.streamName, this.groupName, messageId);
            } catch (procErr) {
              console.error(`[EventListener] Error processing message ${messageId}:`, procErr);
              // Depending on requirements, we could add DLQ logic here.
            }
          }
        }
      } catch (err) {
        console.error('[EventListener] Error reading from stream', err);
        // Wait a bit before retrying on error
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  private async processEvent(payload: any) {
    const { event, data } = payload;
    let parsedData: any;
    try {
      parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      parsedData = data;
    }

    switch (event) {
      case 'loan.created':
        await this.handleLoanCreated(parsedData);
        break;
      case 'loan.disbursed':
        await this.handleLoanDisbursed(parsedData);
        break;
      case 'repayment.paid':
        await this.handleRepaymentPaid(parsedData);
        break;
      default:
        console.log(`[EventListener] Unhandled event type: ${event}`);
    }
  }

  private async handleLoanCreated(data: any) {
    console.log(`[EventListener] Handling loan.created for loanId: ${data.loanId}`);
    // Create the Loan in PENDING state
    await extendedPrisma.loan.create({
      data: {
        id: data.loanId,
        user_id: data.userId,
        merchant_id: data.merchantId,
        principal: data.principal,
        interest: data.interest,
        tenor: data.tenor,
        risk_tier: data.riskTier || 'UNKNOWN',
        status: 'PENDING',
      }
    });
    console.log(`[EventListener] Loan ${data.loanId} created successfully.`);
  }

  private async handleLoanDisbursed(data: any) {
    console.log(`[EventListener] Handling loan.disbursed for loanId: ${data.loanId}`);
    
    // Core Ledger logic: Isolated transaction
    // 1. Write an immutable ledger row (DISBURSEMENT)
    // 2. Set loan status to ACTIVE
    await extendedPrisma.$transaction(async (tx) => {
      // Create Ledger Entry
      await tx.ledger.create({
        data: {
          reference_id: data.loanId,
          amount: data.amount,
          debit_credit: 'DEBIT', // Disbursing a loan is a debit to the platform's float
          transaction_type: 'DISBURSEMENT',
        }
      });

      // Update Loan Status
      await tx.loan.update({
        where: { id: data.loanId },
        data: {
          status: 'ACTIVE',
          start_date: new Date(),
        }
      });
    });
    
    console.log(`[EventListener] Loan ${data.loanId} marked ACTIVE and Ledger updated.`);
  }

  private async handleRepaymentPaid(data: any) {
    console.log(`[EventListener] Handling repayment.paid for loanId: ${data.loanId}`);
    // 1. Write an immutable ledger row (REPAYMENT)
    // 2. Update Repayment record
    await extendedPrisma.$transaction(async (tx) => {
      await tx.ledger.create({
        data: {
          reference_id: data.repaymentId || `rep_${Date.now()}`,
          amount: data.amountPaid,
          debit_credit: 'CREDIT', // Receiving repayment is a credit to the platform
          transaction_type: 'REPAYMENT',
        }
      });

      // Simple implementation: Create a repayment record
      await tx.repayment.create({
        data: {
          loan_id: data.loanId,
          installment_number: data.installmentNumber || 1,
          due_date: new Date(), // Example
          amount_due: data.amountPaid, // Example
          amount_paid: data.amountPaid,
          status: 'PAID',
        }
      });
    });
    console.log(`[EventListener] Repayment processed for loan ${data.loanId}. Ledger updated.`);
  }
}
