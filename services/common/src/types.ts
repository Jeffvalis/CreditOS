// User fields for identity and KYC
export interface UserKYCInfo {
  name: string;
  email: string;
  phone: string;
  bvn: string;
  nin: string;
}

// POST /v1/checkouts Payload
export interface CheckoutRequest {
  merchantId: string;
  amount: number;
  customer: UserKYCInfo;
  metadata?: Record<string, any>;
}

// POST /v1/verify Payload
export interface VerifyRequest {
  userId: string;
  bvn?: string;
  nin?: string;
}

// GET /v1/offers Query Parameters
export interface OffersQuery {
  userId: string;
  amount?: number;
}

// GET /v1/offers Response
export interface OfferItem {
  id: string;
  principal: number;
  interest: number;
  tenorMonths: number;
  monthlyRepayment: number;
}

export interface OffersResponse {
  userId: string;
  eligible: boolean;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'DECLINED';
  offers: OfferItem[];
  rejectionReason?: string;
}

// POST /v1/loans Payload
export interface LoanRequest {
  userId: string;
  merchantId: string;
  offerId: string;
  principal: number;
  interest: number;
  tenor: number; // in months
  idempotencyKey?: string;
}

// POST /v1/repayments Payload
export interface RepaymentRequest {
  loanId: string;
  amount: number;
  paymentMethod: 'AUTO_DEBIT' | 'CARD' | 'BANK_TRANSFER';
  transactionReference: string;
}

// Alternative data input from bank statement providers (Mono/Okra)
export interface MonoStatementData {
  monthlyIncome: number;
  monthlyExpenses: number;
  averageBalance: number;
  gamblingTransactionsCount: number;
  failedDirectDebitsCount: number;
}

// Credit history details from CRC bureau
export interface CrcBureauState {
  bureauScore: number;
  activeLoansCount: number;
  outstandingBalance: number;
  hasDefaulted: boolean;
  delinquentDays: number;
  isBlacklisted: boolean;
  identityMatchScore: number; // 0 to 100
}

// Stability information
export interface StabilityInput {
  employmentTenureMonths: number;
  employmentType: 'SALARIED' | 'SELF_EMPLOYED' | 'UNEMPLOYED';
}

// POST /internal/calculate-score Payload
export interface ScoreCalculationRequest {
  userId: string;
  monoData: MonoStatementData;
  crcData: CrcBureauState;
  stabilityData: StabilityInput;
}

// POST /internal/calculate-score Response
export interface ScoreCalculationResponse {
  userId: string;
  capacityScore: number;      // max 40
  creditHistoryScore: number; // max 25
  behavioralScore: number;    // max 20
  stabilityScore: number;     // max 15
  finalScore: number;         // max 100
  riskTier: 'A' | 'B' | 'C' | 'D';
  status: 'APPROVED' | 'DECLINED';
  downpaymentPercentage: number;
  eligibleTenors: number[];
  monthlyInterestRate: number;
  rejectionReason?: string;
  executionTimeMs: number;
}
