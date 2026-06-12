import assert from 'assert';

async function request(url: string, payload: any) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  return { status: res.status, data: JSON.parse(text) };
}

async function runTests() {
  const SCORING_URL = 'http://localhost:8000/internal/calculate-score';
  console.log('🚀 Starting Credit Decision Engine scoring tests...\n');

  try {
    // -------------------------------------------------------------
    // TEST 1: Tier A - Excellent Profile
    // -------------------------------------------------------------
    console.log('--- TEST 1: Tier A (Excellent) ---');
    const t1Payload = {
      userId: 'usr_excellent_001',
      monoData: {
        monthlyIncome: 500000,
        monthlyExpenses: 100000, // DTI = 20% (20 pts)
        averageBalance: 150000,   // Avg Balance >= 100k (20 pts)
        gamblingTransactionsCount: 0, // 10 pts
        failedDirectDebitsCount: 0,   // 10 pts
      },
      crcData: {
        bureauScore: 750,        // >= 700 (10 pts)
        activeLoansCount: 0,
        outstandingBalance: 0,
        hasDefaulted: false,
        delinquentDays: 0,        // 0 DPD (15 pts)
        isBlacklisted: false,
        identityMatchScore: 95,   // valid
      },
      stabilityData: {
        employmentTenureMonths: 36, // >= 24m (8 pts)
        employmentType: 'SALARIED', // SALARIED (7 pts)
      },
    };

    const t1 = await request(SCORING_URL, t1Payload);
    console.log(`Status: ${t1.status}`);
    console.log(`Final Score: ${t1.data.finalScore}, Risk Tier: ${t1.data.riskTier}`);
    console.log(`Downpayment: ${t1.data.downpaymentPercentage}%, Tenors: ${t1.data.eligibleTenors}`);

    assert.strictEqual(t1.status, 200);
    assert.strictEqual(t1.data.finalScore, 100);
    assert.strictEqual(t1.data.riskTier, 'A');
    assert.strictEqual(t1.data.status, 'APPROVED');
    assert.strictEqual(t1.data.downpaymentPercentage, 10);
    assert.deepStrictEqual(t1.data.eligibleTenors, [3, 6, 12]);
    assert.ok(t1.data.executionTimeMs < 50, 'Scoring should execute in < 50ms');
    console.log('✅ TEST 1 Passed!\n');

    // -------------------------------------------------------------
    // TEST 2: Tier B - Good Profile
    // -------------------------------------------------------------
    console.log('--- TEST 2: Tier B (Good) ---');
    const t2Payload = {
      userId: 'usr_good_002',
      monoData: {
        monthlyIncome: 300000,
        monthlyExpenses: 120000, // DTI = 40% (12 pts)
        averageBalance: 60000,    // Avg Balance >= 50k (12 pts)
        gamblingTransactionsCount: 1, // <= 2 (5 pts)
        failedDirectDebitsCount: 0,   // 10 pts
      },
      crcData: {
        bureauScore: 650,        // >= 600 (6 pts)
        activeLoansCount: 1,
        outstandingBalance: 20000,
        hasDefaulted: false,
        delinquentDays: 0,        // 0 DPD (15 pts)
        isBlacklisted: false,
        identityMatchScore: 85,
      },
      stabilityData: {
        employmentTenureMonths: 18, // >= 12m (4 pts)
        employmentType: 'SALARIED', // SALARIED (7 pts)
      },
    };

    const t2 = await request(SCORING_URL, t2Payload);
    console.log(`Status: ${t2.status}`);
    console.log(`Final Score: ${t2.data.finalScore}, Risk Tier: ${t2.data.riskTier}`);
    console.log(`Downpayment: ${t2.data.downpaymentPercentage}%, Tenors: ${t2.data.eligibleTenors}`);

    assert.strictEqual(t2.status, 200);
    assert.strictEqual(t2.data.finalScore, 71);
    assert.strictEqual(t2.data.riskTier, 'B');
    assert.strictEqual(t2.data.status, 'APPROVED');
    assert.strictEqual(t2.data.downpaymentPercentage, 20);
    assert.deepStrictEqual(t2.data.eligibleTenors, [3, 6]);
    console.log('✅ TEST 2 Passed!\n');

    // -------------------------------------------------------------
    // TEST 3: Tier C - Fair Profile
    // -------------------------------------------------------------
    console.log('--- TEST 3: Tier C (Fair) ---');
    const t3Payload = {
      userId: 'usr_fair_003',
      monoData: {
        monthlyIncome: 150000,
        monthlyExpenses: 80000,  // DTI = 53% (6 pts)
        averageBalance: 120000,  // Avg Balance >= 100k (20 pts)
        gamblingTransactionsCount: 3, // > 2 (0 pts)
        failedDirectDebitsCount: 1,   // 5 pts
      },
      crcData: {
        bureauScore: 550,        // < 600 (2 pts)
        activeLoansCount: 2,
        outstandingBalance: 80000,
        hasDefaulted: false,
        delinquentDays: 0,        // 0 DPD (15 pts)
        isBlacklisted: false,
        identityMatchScore: 82,
      },
      stabilityData: {
        employmentTenureMonths: 6,   // < 12m (1 pt)
        employmentType: 'SELF_EMPLOYED', // SELF_EMPLOYED (3 pts)
      },
    };

    const t3 = await request(SCORING_URL, t3Payload);
    console.log(`Status: ${t3.status}`);
    console.log(`Final Score: ${t3.data.finalScore}, Risk Tier: ${t3.data.riskTier}`);
    console.log(`Downpayment: ${t3.data.downpaymentPercentage}%, Tenors: ${t3.data.eligibleTenors}`);

    assert.strictEqual(t3.status, 200);
    assert.strictEqual(t3.data.finalScore, 52);
    assert.strictEqual(t3.data.riskTier, 'C');
    assert.strictEqual(t3.data.status, 'APPROVED');
    assert.strictEqual(t3.data.downpaymentPercentage, 30);
    assert.deepStrictEqual(t3.data.eligibleTenors, [3]);
    console.log('✅ TEST 3 Passed!\n');

    // -------------------------------------------------------------
    // TEST 4: Tier D - Declined Profile (Low score)
    // -------------------------------------------------------------
    console.log('--- TEST 4: Tier D (Low Score Decline) ---');
    const t4Payload = {
      userId: 'usr_poor_004',
      monoData: {
        monthlyIncome: 150000,
        monthlyExpenses: 120000, // DTI = 80% (0 pts)
        averageBalance: 5000,     // < 20k (0 pts)
        gamblingTransactionsCount: 5, // 0 pts
        failedDirectDebitsCount: 3,   // 0 pts
      },
      crcData: {
        bureauScore: 500,        // 2 pts
        activeLoansCount: 4,
        outstandingBalance: 250000,
        hasDefaulted: false,
        delinquentDays: 45,       // > 30 DPD (0 pts)
        isBlacklisted: false,
        identityMatchScore: 85,
      },
      stabilityData: {
        employmentTenureMonths: 3,  // 1 pt
        employmentType: 'UNEMPLOYED', // 0 pts
      },
    };

    const t4 = await request(SCORING_URL, t4Payload);
    console.log(`Status: ${t4.status}`);
    console.log(`Status Result: ${t4.data.status}, Risk Tier: ${t4.data.riskTier}`);
    console.log(`Rejection Reason: ${t4.data.rejectionReason}`);

    assert.strictEqual(t4.status, 200);
    assert.strictEqual(t4.data.status, 'DECLINED');
    assert.strictEqual(t4.data.riskTier, 'D');
    assert.ok(t4.data.finalScore < 45);
    console.log('✅ TEST 4 Passed!\n');

    // -------------------------------------------------------------
    // TEST 5: Hard Rejection - Blacklisted
    // -------------------------------------------------------------
    console.log('--- TEST 5: Hard Rejection (Blacklisted) ---');
    // Using Tier A profile inputs, but changing isBlacklisted = true
    const t5Payload = { ...t1Payload, crcData: { ...t1Payload.crcData, isBlacklisted: true } };

    const t5 = await request(SCORING_URL, t5Payload);
    console.log(`Status: ${t5.status}`);
    console.log(`Status Result: ${t5.data.status}, Risk Tier: ${t5.data.riskTier}`);
    console.log(`Rejection Reason: ${t5.data.rejectionReason}`);

    assert.strictEqual(t5.status, 200);
    assert.strictEqual(t5.data.status, 'DECLINED');
    assert.strictEqual(t5.data.riskTier, 'D');
    assert.ok(t5.data.rejectionReason.includes('blacklist'));
    console.log('✅ TEST 5 Passed!\n');

    // -------------------------------------------------------------
    // TEST 6: Hard Rejection - Active Default
    // -------------------------------------------------------------
    console.log('--- TEST 6: Hard Rejection (Active Default) ---');
    // Using Tier A profile inputs, but changing hasDefaulted = true
    const t6Payload = { ...t1Payload, crcData: { ...t1Payload.crcData, hasDefaulted: true } };

    const t6 = await request(SCORING_URL, t6Payload);
    console.log(`Status: ${t6.status}`);
    console.log(`Status Result: ${t6.data.status}, Risk Tier: ${t6.data.riskTier}`);
    console.log(`Rejection Reason: ${t6.data.rejectionReason}`);

    assert.strictEqual(t6.status, 200);
    assert.strictEqual(t6.data.status, 'DECLINED');
    assert.strictEqual(t6.data.riskTier, 'D');
    assert.ok(t6.data.rejectionReason.includes('default'));
    console.log('✅ TEST 6 Passed!\n');

    // -------------------------------------------------------------
    // TEST 7: Hard Rejection - Identity Match Score < 80
    // -------------------------------------------------------------
    console.log('--- TEST 7: Hard Rejection (Identity Match Score) ---');
    // Using Tier A profile inputs, but changing identityMatchScore = 75
    const t7Payload = { ...t1Payload, crcData: { ...t1Payload.crcData, identityMatchScore: 75 } };

    const t7 = await request(SCORING_URL, t7Payload);
    console.log(`Status: ${t7.status}`);
    console.log(`Status Result: ${t7.data.status}, Risk Tier: ${t7.data.riskTier}`);
    console.log(`Rejection Reason: ${t7.data.rejectionReason}`);

    assert.strictEqual(t7.status, 200);
    assert.strictEqual(t7.data.status, 'DECLINED');
    assert.strictEqual(t7.data.riskTier, 'D');
    assert.ok(t7.data.rejectionReason.includes('Identity match score'));
    console.log('✅ TEST 7 Passed!\n');

    console.log('🎉 ALL CREDIT DECISION ENGINE TESTS PASSED SUCCESSFULLY! 🎉\n');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

runTests();
