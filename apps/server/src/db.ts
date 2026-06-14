import { PrismaClient } from "@prisma/client";

/** Cliente Prisma compartilhado pelo processo. */
export const prisma = new PrismaClient();
