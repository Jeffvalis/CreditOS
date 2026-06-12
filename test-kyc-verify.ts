import assert from 'assert';

async function request(url: string, method: string, payload?: any) {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (payload) {
    options.body = JSON.stringify(payload);
  }

  const res = await fetch(url, options);
  const text = await res.text();
  let data: any = null;
  try {
    data = JSON.parse(text);
  } catch (e) {
    // Not JSON
  }
  return { status: res.status, data, text };
}

async function runTests() {
  const GATEWAY_URL = 'http://localhost:8000';
  console.log('🚀 Starting Identity/KYC service verification tests...\n');

  try {
    // -------------------------------------------------------------
    // TEST 1: Successful verification
    // -------------------------------------------------------------
    console.log('--- TEST 1: Successful Verification (John Doe) ---');
    const t1Payload = {
      name: 'John Doe',
      email: 'john.success@example.com',
      phone: '+2348011111111',
      bvn: '22222222222',
      nin: '99999999999',
      dob: '1995-08-15',
      deviceFingerprint: 'device_john_123',
    };
    
    const t1 = await request(`${GATEWAY_URL}/internal/verify`, 'POST', t1Payload);
    console.log(`Status: ${t1.status}`);
    console.log(`Response:`, t1.data);
    
    assert.strictEqual(t1.status, 200, 'Expected status 200 for successful verification');
    assert.strictEqual(t1.data.kycStatus, 'VERIFIED');
    assert.strictEqual(t1.data.riskFlag, false);
    const userId = t1.data.userId;
    assert.ok(userId, 'Should return a userId');
    console.log('✅ TEST 1 Passed!\n');

    // -------------------------------------------------------------
    // TEST 2: Encryption check in database
    // -------------------------------------------------------------
    console.log('--- TEST 2: Encryption check in DB ---');
    const t2 = await request(`${GATEWAY_URL}/internal/users/${userId}`, 'GET');
    console.log(`Status: ${t2.status}`);
    console.log(`Encrypted BVN: ${t2.data.user.encrypted_bvn}`);
    console.log(`Encrypted NIN: ${t2.data.user.encrypted_nin}`);
    console.log(`Decrypted BVN: ${t2.data.user.decrypted_bvn}`);
    console.log(`Decrypted NIN: ${t2.data.user.decrypted_nin}`);

    assert.notStrictEqual(t2.data.user.encrypted_bvn, '22222222222', 'BVN should be encrypted in DB');
    assert.notStrictEqual(t2.data.user.encrypted_nin, '99999999999', 'NIN should be encrypted in DB');
    assert.strictEqual(t2.data.user.decrypted_bvn, '22222222222', 'Decrypted BVN should match original');
    assert.strictEqual(t2.data.user.decrypted_nin, '99999999999', 'Decrypted NIN should match original');
    console.log('✅ TEST 2 Passed! AES-256-GCM working correctly.\n');

    // -------------------------------------------------------------
    // TEST 3: BVN Mismatch Failure
    // -------------------------------------------------------------
    console.log('--- TEST 3: BVN Name/DOB Mismatch ---');
    const t3Payload = {
      name: 'Wrong Name',
      email: 'john.mismatch@example.com',
      phone: '+2348011111111',
      bvn: '22222222222', // valid BVN
      nin: '99999999999',
      dob: '1995-08-15', // correct DOB, but name is wrong
      deviceFingerprint: 'device_mismatch_123',
    };

    const t3 = await request(`${GATEWAY_URL}/internal/verify`, 'POST', t3Payload);
    console.log(`Status: ${t3.status}`);
    console.log(`Response:`, t3.data);

    assert.strictEqual(t3.status, 400, 'Expected status 400 for name mismatch');
    assert.strictEqual(t3.data.code, 'IDENTITY_MISMATCH');
    console.log('✅ TEST 3 Passed! Instant failure on name mismatch.\n');

    // -------------------------------------------------------------
    // TEST 4: Device Fingerprint Reuse Failure
    // -------------------------------------------------------------
    console.log('--- TEST 4: Device Fingerprint Reuse Check ---');
    const t4Payload = {
      name: 'Jane Smith',
      email: 'jane.fraud@example.com', // different email
      phone: '+2348022222222',
      bvn: '33333333333', // valid BVN
      nin: '88888888888',
      dob: '1992-12-01',
      deviceFingerprint: 'device_john_123', // REUSED fingerprint from Test 1!
    };

    const t4 = await request(`${GATEWAY_URL}/internal/verify`, 'POST', t4Payload);
    console.log(`Status: ${t4.status}`);
    console.log(`Response:`, t4.data);

    assert.strictEqual(t4.status, 400, 'Expected status 400 for fingerprint reuse');
    assert.strictEqual(t4.data.code, 'FINGERPRINT_REUSE');
    console.log('✅ TEST 4 Passed! Instant failure on fingerprint reuse.\n');

    console.log('🎉 ALL HARD REJECTION & ENCRYPTION TESTS PASSED SUCCESSFULLY! 🎉\n');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Test execution failed:', error.message);
    process.exit(1);
  }
}

runTests();
