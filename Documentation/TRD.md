# CreditOS (Lendr) - Technical Requirements Document (TRD)

## 1. Product Overview & Goal
Build a plug-and-play API platform enabling merchants to offer instant, embedded credit at checkout. The system handles identity verification, bank data aggregation, real-time credit scoring (< 500ms), loan disbursement, repayments, and merchant webhooks.

## 2. Technical Specifications

### 2.1 Core Modules (Modular Monolith)
*   **Identity/KYC Module**: Handles BVN/NIN verification via external APIs (e.g., Dojah/NIMC).
*   **Bank Data Aggregation Module**: Integrates with financial data providers (e.g., Mono/Okra) for statement parsing.
*   **Credit Decision Engine**: Implements the 100-point scoring algorithm:
    *   Capacity (40 pts)
    *   Credit History (25 pts)
    *   Behavioral (20 pts)
    *   Stability (15 pts)
    *   Hard Rejection layers (Fraud, Blacklists, ID Mismatches) to ensure < 500ms execution.
*   **Loan & Repayment Module**: Manages loan lifecycles, ledger entries, and repayment schedules.
*   **Payment Module**: Handles payment gateway integrations (e.g., Paystack) for disbursement and auto-debits.
*   **Webhook & Notification Module**: Manages outbound asynchronous events to merchants via retry queues.

### 2.2 Database Schema (PostgreSQL recommended)
*   **Users**: `id`, `name`, `email`, `phone`, `bvn_encrypted`, `nin_encrypted`, `kyc_status`, `risk_flag`.
*   **Loans**: `id`, `user_id`, `merchant_id`, `principal`, `interest`, `tenor`, `status`, `risk_tier`, `start_date`, `end_date`.
*   **Repayments**: `id`, `loan_id`, `installment_number`, `due_date`, `amount_due`, `amount_paid`, `status`.
*   **Ledger (Immutable)**: `id`, `reference_id`, `amount`, `debit_credit`, `transaction_type` (disbursement, repayment, fee).

### 2.3 Event System
*   **Core Events**: `loan.created`, `loan.approved`, `loan.disbursed`, `loan.defaulted`, `payment.successful`, `payment.failed`, `repayment.due`.
*   **Webhook Features**: 
    *   HMAC Signature verification for secure communication.
    *   Idempotency keys (`event_id`) to prevent duplicate processing.
    *   Exponential backoff retry logic for failed deliveries.

### 2.4 Non-Functional Requirements
*   **Performance**: Total checkout decision < 5 seconds. Scoring algorithm < 500ms.
*   **Security**: Field-level encryption for PII (BVN, NIN). Immutable ledger to prevent financial data tampering.
*   **Reliability**: 99.9% uptime with fail-safe integration fallbacks (e.g., fallback estimation if bank data is missing).
