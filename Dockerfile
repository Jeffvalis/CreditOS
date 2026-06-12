FROM node:18-alpine

WORKDIR /app

# Copy root and all service package.json files for efficient caching
COPY package.json package-lock.json* ./
COPY services/identity-kyc/package.json ./services/identity-kyc/
COPY services/decision-engine/package.json ./services/decision-engine/
COPY services/payment-processing/package.json ./services/payment-processing/
COPY services/core-ledger-loan/package.json ./services/core-ledger-loan/
COPY services/common/package.json ./services/common/

# Install all dependencies (workspaces will link automatically)
RUN npm install

# Copy all source code
COPY . .

# Generate Prisma clients
RUN npx prisma generate --schema=services/identity-kyc/prisma/schema.prisma || true
RUN npx prisma generate --schema=services/core-ledger-loan/prisma/schema.prisma || true

EXPOSE 8000 8001 8002 8003 8004

# Default to gateway, overridden in docker-compose.yml
CMD ["npm", "run", "start:gateway"]
