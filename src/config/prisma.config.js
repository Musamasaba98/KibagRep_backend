import "dotenv/config";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { PrismaPg } from "@prisma/adapter-pg";

// Render's external PostgreSQL requires SSL. Add sslmode if not already present.
const connectionString = process.env.DATABASE_URL?.includes("sslmode")
  ? process.env.DATABASE_URL
  : `${process.env.DATABASE_URL}?sslmode=require`;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

export default prisma;