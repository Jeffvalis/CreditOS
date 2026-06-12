import crypto from 'crypto';
import { chargeAuthorization } from './paystack';
import { WebhookNotifier } from './webhook-notifier';

export interface AutoDebitJob {
  id: string;
  loanId: string;
  email: string;
  amount: number; // in kobo
  authorizationCode: string;
  merchantWebhookUrl: string;
  attempts: number;
  maxAttempts: number;
  status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED';
  lastError?: string;
  createdAt: string;
}

/**
 * AutoDebitQueue: An interval-based background worker that processes
 * tokenized card auto-debits with a strict 3x retry policy.
 *
 * - Each job calls the real Paystack `charge_authorization` endpoint.
 * - On success, marks the job as SUCCESS.
 * - On failure, retries up to 3 times. After the 3rd failure, dispatches
 *   a signed `payment.failed` webhook to the merchant.
 */
export class AutoDebitQueue {
  private queue: AutoDebitJob[] = [];
  private webhookNotifier: WebhookNotifier;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processing = false;

  constructor(webhookNotifier: WebhookNotifier) {
    this.webhookNotifier = webhookNotifier;
  }

  /**
   * Enqueue a new auto-debit job.
   */
  enqueue(params: {
    loanId: string;
    email: string;
    amount: number;
    authorizationCode: string;
    merchantWebhookUrl: string;
  }): AutoDebitJob {
    const job: AutoDebitJob = {
      id: `job_${crypto.randomUUID()}`,
      loanId: params.loanId,
      email: params.email,
      amount: params.amount,
      authorizationCode: params.authorizationCode,
      merchantWebhookUrl: params.merchantWebhookUrl,
      attempts: 0,
      maxAttempts: 3,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.queue.push(job);
    console.log(`[AutoDebitQueue] Enqueued job ${job.id} for loanId: ${params.loanId}`);
    return job;
  }

  /**
   * Process all pending jobs in the queue.
   */
  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    const pendingJobs = this.queue.filter((j) => j.status === 'PENDING');

    for (const job of pendingJobs) {
      job.status = 'PROCESSING';
      job.attempts += 1;

      console.log(`[AutoDebitQueue] Processing job ${job.id}, attempt ${job.attempts}/${job.maxAttempts}`);

      try {
        const result = await chargeAuthorization({
          amount: job.amount,
          email: job.email,
          authorizationCode: job.authorizationCode,
        });

        if (result.status) {
          job.status = 'SUCCESS';
          console.log(`[AutoDebitQueue] Job ${job.id} succeeded on attempt ${job.attempts}`);
        } else {
          job.lastError = result.gatewayResponse;
          console.warn(`[AutoDebitQueue] Job ${job.id} failed attempt ${job.attempts}: ${result.gatewayResponse}`);

          if (job.attempts >= job.maxAttempts) {
            job.status = 'FAILED';
            console.error(`[AutoDebitQueue] Job ${job.id} exhausted all ${job.maxAttempts} retries. Dispatching payment.failed webhook.`);

            await this.webhookNotifier.dispatch(
              job.merchantWebhookUrl,
              'payment.failed',
              {
                jobId: job.id,
                loanId: job.loanId,
                email: job.email,
                amount: job.amount,
                attempts: job.attempts,
                lastError: job.lastError,
                failedAt: new Date().toISOString(),
              }
            );
          } else {
            // Return to PENDING for retry on next cycle
            job.status = 'PENDING';
          }
        }
      } catch (error: any) {
        job.lastError = error.message;
        console.error(`[AutoDebitQueue] Job ${job.id} exception on attempt ${job.attempts}: ${error.message}`);

        if (job.attempts >= job.maxAttempts) {
          job.status = 'FAILED';

          await this.webhookNotifier.dispatch(
            job.merchantWebhookUrl,
            'payment.failed',
            {
              jobId: job.id,
              loanId: job.loanId,
              email: job.email,
              amount: job.amount,
              attempts: job.attempts,
              lastError: job.lastError,
              failedAt: new Date().toISOString(),
            }
          );
        } else {
          job.status = 'PENDING';
        }
      }
    }

    this.processing = false;
  }

  /**
   * Start the background worker loop (processes every intervalMs).
   */
  start(intervalMs: number = 2000): void {
    if (this.intervalId) return;
    console.log(`[AutoDebitQueue] Worker started (interval: ${intervalMs}ms)`);
    this.intervalId = setInterval(() => this.processQueue(), intervalMs);
  }

  /**
   * Stop the background worker loop.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[AutoDebitQueue] Worker stopped.');
    }
  }

  /**
   * Get queue status for debugging.
   */
  getStatus(): { total: number; pending: number; processing: number; success: number; failed: number; jobs: AutoDebitJob[] } {
    return {
      total: this.queue.length,
      pending: this.queue.filter((j) => j.status === 'PENDING').length,
      processing: this.queue.filter((j) => j.status === 'PROCESSING').length,
      success: this.queue.filter((j) => j.status === 'SUCCESS').length,
      failed: this.queue.filter((j) => j.status === 'FAILED').length,
      jobs: this.queue,
    };
  }
}
