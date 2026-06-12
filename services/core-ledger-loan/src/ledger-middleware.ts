import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

// Use Prisma Client Extensions to enforce immutable Ledger
export const extendedPrisma = prisma.$extends({
  query: {
    ledger: {
      async update({ model, operation, args, query }) {
        throw new Error('Ledger is immutable. Update operations are strictly blocked.');
      },
      async updateMany({ model, operation, args, query }) {
        throw new Error('Ledger is immutable. Update operations are strictly blocked.');
      },
      async delete({ model, operation, args, query }) {
        throw new Error('Ledger is immutable. Delete operations are strictly blocked.');
      },
      async deleteMany({ model, operation, args, query }) {
        throw new Error('Ledger is immutable. Delete operations are strictly blocked.');
      },
      async upsert({ model, operation, args, query }) {
        throw new Error('Ledger is immutable. Upsert operations are strictly blocked.');
      },
    },
  },
});
