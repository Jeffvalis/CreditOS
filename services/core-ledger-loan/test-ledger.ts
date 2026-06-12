import Redis from 'ioredis';
import { extendedPrisma } from './src/ledger-middleware';

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const streamName = 'creditos:events';

async function runTest() {
  console.log('--- Starting Core Ledger Test ---');
  
  const loanId = `test_loan_${Date.now()}`;
  
  // 1. Publish loan.created event
  console.log(`Publishing loan.created for ${loanId}...`);
  await redis.xadd(
    streamName, '*',
    'event', 'loan.created',
    'data', JSON.stringify({
      loanId,
      userId: 'user_123',
      merchantId: 'merch_456',
      principal: 10000,
      interest: 500,
      tenor: 3,
      riskTier: 'A'
    })
  );

  // Wait a moment for processing
  await new Promise(r => setTimeout(r, 2000));
  
  // Verify Loan was created
  let loan = await extendedPrisma.loan.findUnique({ where: { id: loanId } });
  console.log(`Loan created status: ${loan?.status} (Expected: PENDING)`);

  // 2. Publish loan.disbursed event
  console.log(`Publishing loan.disbursed for ${loanId}...`);
  await redis.xadd(
    streamName, '*',
    'event', 'loan.disbursed',
    'data', JSON.stringify({
      loanId,
      amount: 10000
    })
  );

  // Wait a moment for processing
  await new Promise(r => setTimeout(r, 2000));

  // Verify Loan is ACTIVE and Ledger entry exists
  loan = await extendedPrisma.loan.findUnique({ where: { id: loanId } });
  console.log(`Loan status after disbursement: ${loan?.status} (Expected: ACTIVE)`);

  const ledgerEntries = await extendedPrisma.ledger.findMany({ where: { reference_id: loanId } });
  console.log(`Ledger entries found: ${ledgerEntries.length} (Expected: 1)`);
  if (ledgerEntries.length > 0) {
    const entry = ledgerEntries[0];
    console.log(`Ledger entry details: ${entry.transaction_type} / ${entry.debit_credit} / Amount: ${entry.amount}`);
    
    // 3. Test Immutable Ledger enforcement
    console.log('Attempting to update the Ledger entry (should fail)...');
    try {
      await extendedPrisma.ledger.update({
        where: { id: entry.id },
        data: { amount: 9999 }
      });
      console.log('❌ ERROR: Ledger update succeeded! This should have been blocked.');
    } catch (err: any) {
      console.log(`✅ Success: Ledger update was blocked. Error message: ${err.message}`);
    }
    
    console.log('Attempting to delete the Ledger entry (should fail)...');
    try {
      await extendedPrisma.ledger.delete({ where: { id: entry.id } });
      console.log('❌ ERROR: Ledger deletion succeeded! This should have been blocked.');
    } catch (err: any) {
      console.log(`✅ Success: Ledger deletion was blocked. Error message: ${err.message}`);
    }
  }

  console.log('--- Test Complete ---');
  process.exit(0);
}

runTest().catch(console.error);
