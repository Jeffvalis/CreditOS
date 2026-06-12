import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from './utils/crypto';
import { CheckoutRequest, VerifyRequest } from '@creditos/common';

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 8001;

app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`[Identity-KYC Service] ${req.method} ${req.url}`);
  next();
});

// Mock database for external BVN registry (e.g. Dojah / NIMC simulation)
const mockBvnRegistry: Record<string, { name: string; dob: string }> = {
  '22222222222': { name: 'John Doe', dob: '1995-08-15' },
  '33333333333': { name: 'Jane Smith', dob: '1992-12-01' },
};

// Interface for Internal Verification request
interface InternalVerifyRequest {
  name: string;
  email: string;
  phone: string;
  bvn: string;
  nin: string;
  dob: string; // YYYY-MM-DD
  deviceFingerprint: string;
}

// POST /v1/checkouts - Client-facing checkout endpoint
app.post('/v1/checkouts', (req: Request<{}, {}, CheckoutRequest>, res: Response) => {
  const payload = req.body;

  if (!payload.merchantId || !payload.amount || !payload.customer) {
    return res.status(400).json({
      success: false,
      error: 'Missing required checkout fields: merchantId, amount, customer',
    });
  }

  const { customer } = payload;
  if (!customer.bvn || !customer.nin || !customer.phone) {
    return res.status(400).json({
      success: false,
      error: 'Missing customer KYC details: bvn, nin, phone',
    });
  }

  console.log(`[Identity-KYC Service] Creating checkout for customer: ${customer.name} (${customer.email})`);

  return res.status(201).json({
    success: true,
    message: 'Checkout initialized successfully',
    checkoutId: `chk_${Math.random().toString(36).substr(2, 9)}`,
    userId: `usr_${Math.random().toString(36).substr(2, 9)}`,
    kycStatus: 'PENDING_VERIFICATION',
  });
});

// POST /v1/verify - Client-facing verify endpoint
app.post('/v1/verify', (req: Request<{}, {}, VerifyRequest>, res: Response) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: userId',
    });
  }

  console.log(`[Identity-KYC Service] Verifying KYC for userId: ${userId}`);

  return res.status(200).json({
    success: true,
    userId,
    kycStatus: 'VERIFIED',
    verifiedAt: new Date().toISOString(),
  });
});

/**
 * POST /internal/verify
 * Runs the Hard Rejection Layer:
 * 1. Mismatch checks between request data and simulated BVN record (Name / DOB)
 * 2. Multi-account abuse checks via device fingerprint reuse
 * 3. Encrypts BVN/NIN fields using AES-256-GCM before database insertion
 */
app.post('/internal/verify', async (req: Request<{}, {}, InternalVerifyRequest>, res: Response) => {
  const { name, email, phone, bvn, nin, dob, deviceFingerprint } = req.body;

  // Basic validation
  if (!name || !email || !phone || !bvn || !nin || !dob || !deviceFingerprint) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: name, email, phone, bvn, nin, dob, deviceFingerprint',
    });
  }

  try {
    // 1. Device Fingerprint Reuse Check (Multi-account abuse prevention)
    const existingFingerprint = await prisma.user.findFirst({
      where: {
        deviceFingerprint,
        email: { not: email }, // Reused on a DIFFERENT email account
      },
    });

    if (existingFingerprint) {
      console.warn(`[Identity-KYC Service] Rejection: Device fingerprint reuse detected for ${email} (Matching user: ${existingFingerprint.email})`);
      
      // Update or create user record as FAILED and flag as risk
      await prisma.user.upsert({
        where: { email },
        update: { kyc_status: 'FAILED', risk_flag: true, deviceFingerprint },
        create: {
          name,
          email,
          phone,
          encrypted_bvn: encrypt(bvn),
          encrypted_nin: encrypt(nin),
          kyc_status: 'FAILED',
          risk_flag: true,
          deviceFingerprint,
        },
      });

      return res.status(400).json({
        success: false,
        error: 'Hard Rejection: Device fingerprint has been reused across accounts',
        code: 'FINGERPRINT_REUSE',
      });
    }

    // 2. BVN Registry Check (Dojah simulation)
    const bvnRegistryRecord = mockBvnRegistry[bvn];
    if (!bvnRegistryRecord) {
      return res.status(400).json({
        success: false,
        error: 'Hard Rejection: BVN record not found in central registry',
        code: 'BVN_NOT_FOUND',
      });
    }

    // Name & DOB validation (case-insensitive check for name)
    const nameMatches = bvnRegistryRecord.name.toLowerCase() === name.toLowerCase();
    const dobMatches = bvnRegistryRecord.dob === dob;

    if (!nameMatches || !dobMatches) {
      console.warn(`[Identity-KYC Service] Rejection: Name/DOB mismatch for BVN: ${bvn}. Expected: ${bvnRegistryRecord.name}/${bvnRegistryRecord.dob}, Got: ${name}/${dob}`);

      // Save user with FAILED KYC status and risk flag
      await prisma.user.upsert({
        where: { email },
        update: { kyc_status: 'FAILED', risk_flag: true, deviceFingerprint },
        create: {
          name,
          email,
          phone,
          encrypted_bvn: encrypt(bvn),
          encrypted_nin: encrypt(nin),
          kyc_status: 'FAILED',
          risk_flag: true,
          deviceFingerprint,
        },
      });

      return res.status(400).json({
        success: false,
        error: 'Hard Rejection: BVN name or DOB mismatch',
        code: 'IDENTITY_MISMATCH',
      });
    }

    // 3. Encrypt and save verified user
    const encryptedBvn = encrypt(bvn);
    const encryptedNin = encrypt(nin);

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name,
        phone,
        encrypted_bvn: encryptedBvn,
        encrypted_nin: encryptedNin,
        kyc_status: 'VERIFIED',
        risk_flag: false,
        deviceFingerprint,
      },
      create: {
        name,
        email,
        phone,
        encrypted_bvn: encryptedBvn,
        encrypted_nin: encryptedNin,
        kyc_status: 'VERIFIED',
        risk_flag: false,
        deviceFingerprint,
      },
    });

    console.log(`[Identity-KYC Service] Verification successful for User: ${user.id}`);

    // Return status
    return res.status(200).json({
      success: true,
      userId: user.id,
      kycStatus: user.kyc_status,
      riskFlag: user.risk_flag,
    });

  } catch (error: any) {
    console.error('[Identity-KYC Service] Error in verify handler:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
    });
  }
});

// GET /internal/users/:id - Debug route to retrieve decrypted user data for verification testing
app.get('/internal/users/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Decrypt fields
    const decryptedBvn = decrypt(user.encrypted_bvn);
    const decryptedNin = decrypt(user.encrypted_nin);

    return res.status(200).json({
      success: true,
      user: {
        ...user,
        decrypted_bvn: decryptedBvn,
        decrypted_nin: decryptedNin,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'identity-kyc' });
});

app.listen(PORT, () => {
  console.log(`[Identity-KYC Service] Running on port ${PORT}`);
});
