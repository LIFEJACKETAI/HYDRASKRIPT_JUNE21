import { defineConfig } from '@prisma/config';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local explicitly for Prisma CLI
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
