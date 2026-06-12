import assert from 'assert';

async function testEndpoint(name: string, url: string, options: RequestInit, expectedStatus: number) {
  console.log(`\n--- Testing ${name} ---`);
  console.log(`Request: ${options.method || 'GET'} ${url}`);
  if (options.body) {
    console.log(`Payload: ${options.body}`);
  }

  try {
    const res = await fetch(url, options);
    const text = await res.text();
    console.log(`Status: ${res.status}`);
    console.log(`Response: ${text}`);
    
    assert.strictEqual(res.status, expectedStatus, `Expected status ${expectedStatus}, got ${res.status}`);
    const data = JSON.parse(text);
    assert.ok(data, 'Response should be valid JSON');
    console.log(`✅ ${name} passed!`);
    return data;
  } catch (error: any) {
    console.error(`❌ ${name} failed:`, error.message);
    throw error;
  }
}

async function runTests() {
  const GATEWAY_URL = 'http://localhost:8000';
  
  try {
    // 1. Gateway health check
    await testEndpoint('Gateway Health Check', `${GATEWAY_URL}/health`, { method: 'GET' }, 200);

    // 2. Identity & KYC: POST /v1/checkouts
    const checkoutRes = await testEndpoint(
      'Identity KYC - Checkouts',
      `${GATEWAY_URL}/v1/checkouts`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchantId: 'merch_001',
          amount: 75000,
          customer: {
            name: 'John Doe',
            email: 'john.doe@example.com',
            phone: '+2348012345678',
            bvn: '22222222222',
            nin: '11111111111',
          },
        }),
      },
      201
    );

    const userId = checkoutRes.userId;
    assert.ok(userId, 'Should return a userId');

    // 3. Identity & KYC: POST /v1/verify
    await testEndpoint(
      'Identity KYC - Verify',
      `${GATEWAY_URL}/v1/verify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          bvn: '22222222222',
          nin: '11111111111',
        }),
      },
      200
    );

    // 4. Decision Engine: GET /v1/offers
    const offersRes = await testEndpoint(
      'Decision Engine - Offers',
      `${GATEWAY_URL}/v1/offers?userId=${userId}&amount=75000`,
      { method: 'GET' },
      200
    );

    const offer = offersRes.offers[0];
    assert.ok(offer, 'Should return at least one credit offer');

    // 5. Payment Processing: POST /v1/loans
    const loanRes = await testEndpoint(
      'Payment Processing - Loans',
      `${GATEWAY_URL}/v1/loans`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          merchantId: 'merch_001',
          offerId: offer.id,
          principal: offer.principal,
          interest: offer.interest,
          tenor: offer.tenorMonths,
        }),
      },
      201
    );

    const loanId = loanRes.loanId;
    assert.ok(loanId, 'Should return a loanId');

    // 6. Payment Processing: POST /v1/repayments
    await testEndpoint(
      'Payment Processing - Repayments',
      `${GATEWAY_URL}/v1/repayments`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loanId: loanId,
          amount: Math.round((offer.principal + offer.interest) / offer.tenorMonths),
          paymentMethod: 'CARD',
          transactionReference: `ref_${Math.random().toString(36).substr(2, 9)}`,
        }),
      },
      200
    );

    console.log('\n🎉 ALL GATEWAY ROUTING TESTS PASSED SUCCESSFULLY! 🎉\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Gateway test suite failed!\n');
    process.exit(1);
  }
}

// Run the verification suite
runTests();
