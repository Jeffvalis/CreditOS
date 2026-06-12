import express, { Request, Response } from 'express';
import { performance } from 'perf_hooks';
import { 
  OffersQuery, 
  OffersResponse, 
  ScoreCalculationRequest, 
  ScoreCalculationResponse 
} from '@creditos/common';

const app = express();
const PORT = process.env.PORT || 8002;

app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`[Decision-Engine Service] ${req.method} ${req.url}`);
  next();
});

/**
 * Math Scoring Engine (100-Point System)
 * Computes:
 * - Capacity (40 pts)
 * - Credit History (25 pts)
 * - Behavioral Signals (20 pts)
 * - Stability (15 pts)
 * Evaluates Hard Rejection layers instantly.
 */
function calculateCreditScore(payload: ScoreCalculationRequest): Omit<ScoreCalculationResponse, 'executionTimeMs'> {
  const { userId, monoData, crcData, stabilityData } = payload;
  
  // 1. Hard Rejection Checks (completed instantly)
  if (crcData.isBlacklisted) {
    return {
      userId,
      capacityScore: 0,
      creditHistoryScore: 0,
      behavioralScore: 0,
      stabilityScore: 0,
      finalScore: 0,
      riskTier: 'D',
      status: 'DECLINED',
      downpaymentPercentage: 0,
      eligibleTenors: [],
      monthlyInterestRate: 0,
      rejectionReason: 'Hard Rejection: User matches blacklist registry.',
    };
  }

  if (crcData.hasDefaulted) {
    return {
      userId,
      capacityScore: 0,
      creditHistoryScore: 0,
      behavioralScore: 0,
      stabilityScore: 0,
      finalScore: 0,
      riskTier: 'D',
      status: 'DECLINED',
      downpaymentPercentage: 0,
      eligibleTenors: [],
      monthlyInterestRate: 0,
      rejectionReason: 'Hard Rejection: Active defaults found in credit bureau history.',
    };
  }

  if (crcData.identityMatchScore < 80) {
    return {
      userId,
      capacityScore: 0,
      creditHistoryScore: 0,
      behavioralScore: 0,
      stabilityScore: 0,
      finalScore: 0,
      riskTier: 'D',
      status: 'DECLINED',
      downpaymentPercentage: 0,
      eligibleTenors: [],
      monthlyInterestRate: 0,
      rejectionReason: `Hard Rejection: Identity match score (${crcData.identityMatchScore}%) is below minimum security threshold (80%).`,
    };
  }

  // 2. Score points calculation

  // --- CAPACITY SCORE (Max 40 points) ---
  let capacityScore = 0;
  // DTI = Expenses / Income
  const dti = monoData.monthlyIncome > 0 ? (monoData.monthlyExpenses / monoData.monthlyIncome) : 1;
  if (dti <= 0.30) {
    capacityScore += 20;
  } else if (dti <= 0.45) {
    capacityScore += 12;
  } else if (dti <= 0.60) {
    capacityScore += 6;
  }

  // Average Monthly Balance (in NGN)
  if (monoData.averageBalance >= 100000) {
    capacityScore += 20;
  } else if (monoData.averageBalance >= 50000) {
    capacityScore += 12;
  } else if (monoData.averageBalance >= 20000) {
    capacityScore += 6;
  }

  // --- CREDIT HISTORY SCORE (Max 25 points) ---
  let creditHistoryScore = 0;
  // Days Past Due (DPD)
  if (crcData.delinquentDays === 0) {
    creditHistoryScore += 15;
  } else if (crcData.delinquentDays <= 30) {
    creditHistoryScore += 8;
  }

  // Bureau Score
  if (crcData.bureauScore >= 700) {
    creditHistoryScore += 10;
  } else if (crcData.bureauScore >= 600) {
    creditHistoryScore += 6;
  } else {
    creditHistoryScore += 2;
  }

  // --- BEHAVIORAL SIGNALS (Max 20 points) ---
  let behavioralScore = 0;
  // Gambling transaction count (Mono transactional tagging)
  if (monoData.gamblingTransactionsCount === 0) {
    behavioralScore += 10;
  } else if (monoData.gamblingTransactionsCount <= 2) {
    behavioralScore += 5;
  }

  // Failed direct debits/returned checks
  if (monoData.failedDirectDebitsCount === 0) {
    behavioralScore += 10;
  } else if (monoData.failedDirectDebitsCount === 1) {
    behavioralScore += 5;
  }

  // --- STABILITY SCORE (Max 15 points) ---
  let stabilityScore = 0;
  // Job Tenure
  if (stabilityData.employmentTenureMonths >= 24) {
    stabilityScore += 8;
  } else if (stabilityData.employmentTenureMonths >= 12) {
    stabilityScore += 4;
  } else {
    stabilityScore += 1;
  }

  // Job Type
  if (stabilityData.employmentType === 'SALARIED') {
    stabilityScore += 7;
  } else if (stabilityData.employmentType === 'SELF_EMPLOYED') {
    stabilityScore += 3;
  }

  // Total points
  const finalScore = capacityScore + creditHistoryScore + behavioralScore + stabilityScore;

  // 3. Mapping to Risk Tiers
  let riskTier: 'A' | 'B' | 'C' | 'D';
  let status: 'APPROVED' | 'DECLINED' = 'APPROVED';
  let downpaymentPercentage = 0;
  let eligibleTenors: number[] = [];
  let monthlyInterestRate = 0;
  let rejectionReason: string | undefined;

  if (finalScore >= 80) {
    riskTier = 'A';
    downpaymentPercentage = 10;
    eligibleTenors = [3, 6, 12];
    monthlyInterestRate = 3.5;
  } else if (finalScore >= 60) {
    riskTier = 'B';
    downpaymentPercentage = 20;
    eligibleTenors = [3, 6];
    monthlyInterestRate = 4.5;
  } else if (finalScore >= 45) {
    riskTier = 'C';
    downpaymentPercentage = 30;
    eligibleTenors = [3];
    monthlyInterestRate = 5.5;
  } else {
    riskTier = 'D';
    status = 'DECLINED';
    downpaymentPercentage = 0;
    eligibleTenors = [];
    monthlyInterestRate = 0;
    rejectionReason = `Credit score of ${finalScore} is below approval threshold of 45.`;
  }

  return {
    userId,
    capacityScore,
    creditHistoryScore,
    behavioralScore,
    stabilityScore,
    finalScore,
    riskTier,
    status,
    downpaymentPercentage,
    eligibleTenors,
    monthlyInterestRate,
    rejectionReason,
  };
}

// POST /internal/calculate-score - Internal scoring calculation
app.post('/internal/calculate-score', (req: Request<{}, {}, ScoreCalculationRequest>, res: Response) => {
  const startTime = performance.now();
  const payload = req.body;

  if (!payload.userId || !payload.monoData || !payload.crcData || !payload.stabilityData) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters: userId, monoData, crcData, stabilityData',
    });
  }

  try {
    const result = calculateCreditScore(payload);
    const endTime = performance.now();
    const executionTimeMs = parseFloat((endTime - startTime).toFixed(3));

    return res.status(200).json({
      success: true,
      ...result,
      executionTimeMs,
    });
  } catch (error: any) {
    console.error('[Decision-Engine] Error calculating score:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
    });
  }
});

// GET /v1/offers - Mocked checkout offers
app.get('/v1/offers', (req: Request<{}, {}, {}, OffersQuery>, res: Response) => {
  const { userId, amount } = req.query;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameter: userId',
    });
  }

  console.log(`[Decision-Engine Service] Calculating credit offers for userId: ${userId}`);
  const principalAmount = amount ? Number(amount) : 50000;

  const response: OffersResponse = {
    userId,
    eligible: true,
    riskTier: 'LOW',
    offers: [
      {
        id: 'off_3m_low',
        principal: principalAmount,
        interest: principalAmount * 0.05,
        tenorMonths: 3,
        monthlyRepayment: Math.round((principalAmount * 1.05) / 3),
      },
      {
        id: 'off_6m_low',
        principal: principalAmount,
        interest: principalAmount * 0.09,
        tenorMonths: 6,
        monthlyRepayment: Math.round((principalAmount * 1.09) / 6),
      }
    ],
  };

  return res.status(200).json(response);
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'decision-engine' });
});

app.listen(PORT, () => {
  console.log(`[Decision-Engine Service] Running on port ${PORT}`);
});
