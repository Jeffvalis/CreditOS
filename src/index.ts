import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import swaggerJsDoc from 'swagger-jsdoc';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Logging Middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [API Gateway] ${req.method} ${req.url}`);
  next();
});

// Swagger/OpenAPI Configuration
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'CreditOS (Lendr) API',
      version: '1.0.0',
      description: 'API documentation for the CreditOS Embedded Credit Platform',
      contact: {
        name: 'CreditOS Support',
      },
    },
    servers: [
      {
        url: 'http://localhost:8000',
        description: 'Development Gateway',
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Lendr-Secret-Key',
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ['./src/index.ts'], // Point to this file for doc annotations
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CreditOS API Docs'
}));

/**
 * @swagger
 * /v1/verify:
 *   post:
 *     summary: Verify User Identity (BVN/NIN)
 *     description: Validates a user's identity details and device fingerprint via the Identity-KYC service.
 *     tags: [Identity]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, phone, bvn, nin, deviceFingerprint]
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               bvn:
 *                 type: string
 *               nin:
 *                 type: string
 *               deviceFingerprint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Identity verified successfully
 *       400:
 *         description: Bad request / missing fields
 *       422:
 *         description: Hard Rejection (e.g., mismatch or fraud)
 */

/**
 * @swagger
 * /v1/offers:
 *   post:
 *     summary: Retrieve Credit Offers
 *     description: Passes aggregated bank and bureau data to the Decision Engine to fetch credit scoring tiers.
 *     tags: [Decision Engine]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, cartValue, bankData, bureauData]
 *             properties:
 *               userId:
 *                 type: string
 *               cartValue:
 *                 type: number
 *               bankData:
 *                 type: object
 *               bureauData:
 *                 type: object
 *     responses:
 *       200:
 *         description: Scoring complete, tiers retrieved
 *       400:
 *         description: Missing input parameters
 */

/**
 * @swagger
 * /v1/statement-upload:
 *   post:
 *     summary: Bank Statement PDF Verification
 *     description: Upload a PDF bank statement for manual extraction and scoring when open banking APIs fail.
 *     tags: [Decision Engine]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Unique identifier for the user
 *               statement:
 *                 type: string
 *                 format: binary
 *                 description: The PDF bank statement file
 *     responses:
 *       200:
 *         description: Bank statement parsed and scored successfully
 *       400:
 *         description: Invalid file format or missing file
 *       500:
 *         description: Failed to parse PDF
 */

/**
 * @swagger
 * /v1/loans:
 *   post:
 *     summary: Initiate Disbursement (Loan)
 *     description: Triggers a loan disbursement logic.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, merchantId, offerId, principal, interest, tenor]
 *             properties:
 *               userId:
 *                 type: string
 *               merchantId:
 *                 type: string
 *               offerId:
 *                 type: string
 *               principal:
 *                 type: number
 *               interest:
 *                 type: number
 *               tenor:
 *                 type: number
 *     responses:
 *       201:
 *         description: Loan successfully disbursed
 *       400:
 *         description: Missing required loan parameters
 */

/**
 * @swagger
 * /v1/repayments:
 *   post:
 *     summary: Process Repayment
 *     description: Process a manual repayment via the Payment Processing service.
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [loanId, amount, paymentMethod, transactionReference]
 *             properties:
 *               loanId:
 *                 type: string
 *               amount:
 *                 type: number
 *               paymentMethod:
 *                 type: string
 *               transactionReference:
 *                 type: string
 *     responses:
 *       200:
 *         description: Repayment processed successfully
 */

/**
 * @swagger
 * /v1/checkouts:
 *   post:
 *     summary: Initiate Checkout
 *     description: Primary entry point for merchant checkouts. (Mapped to KYC/Orchestration)
 *     tags: [Checkout]
 *     responses:
 *       200:
 *         description: Checkout session initiated
 */

// Service target URLs from environment or defaults
const IDENTITY_KYC_URL = process.env.IDENTITY_KYC_SERVICE_URL || 'http://localhost:8001';
const DECISION_ENGINE_URL = process.env.DECISION_ENGINE_SERVICE_URL || 'http://localhost:8002';
const PAYMENT_PROCESSING_URL = process.env.PAYMENT_PROCESSING_SERVICE_URL || 'http://localhost:8003';

/**
 * Route Mappings (Forwarding rules as per TRD and Product Architecture)
 * Note: We do NOT use express.json() globally here to ensure the raw body stream
 * is forwarded without buffering or causing the proxy to hang.
 */

// 1. Identity & KYC Service routes
app.use(
  createProxyMiddleware({
    target: IDENTITY_KYC_URL,
    changeOrigin: true,
    pathFilter: (path) => {
      return (
        path === '/v1/checkouts' ||
        path === '/v1/verify' ||
        path === '/internal/verify' ||
        path.startsWith('/internal/users/')
      );
    },
  })
);

// 2. Decision Engine routes
app.use(
  createProxyMiddleware({
    target: DECISION_ENGINE_URL,
    changeOrigin: true,
    pathFilter: (path) => path === '/v1/offers' || path === '/v1/statement-upload' || path === '/internal/calculate-score',
  })
);

// 3. Payment Processing routes
app.use(
  createProxyMiddleware({
    target: PAYMENT_PROCESSING_URL,
    changeOrigin: true,
    pathFilter: (path) => path === '/v1/loans' || path === '/v1/repayments' || path.startsWith('/api/'),
  })
);

// Gateway local health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    message: 'API Gateway is running',
    services: {
      identityKyc: IDENTITY_KYC_URL,
      decisionEngine: DECISION_ENGINE_URL,
      paymentProcessing: PAYMENT_PROCESSING_URL,
    },
  });
});

// Fallback for unmatched routes
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found or unsupported method',
  });
});

app.listen(PORT, () => {
  console.log(`[API Gateway] High-performance gateway listening on port ${PORT}`);
  console.log(`[API Gateway] Target Identity-KYC service: ${IDENTITY_KYC_URL}`);
  console.log(`[API Gateway] Target Decision-Engine service: ${DECISION_ENGINE_URL}`);
  console.log(`[API Gateway] Target Payment-Processing service: ${PAYMENT_PROCESSING_URL}`);
});
