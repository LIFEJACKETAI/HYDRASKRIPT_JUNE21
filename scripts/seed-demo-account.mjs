// Seed a public DEMO account for HydraSkript plus a sample book so visitors
// hitting the marketplace demo link can log in and click around.
//
// Run from the HydraSkript repo root:
//   npm run db:generate            # ensure Prisma client is generated
//   node scripts/seed-demo-account.mjs
//
// Requires in .env.local:
//   DATABASE_URL
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY      (bypasses RLS; server-only)
//
// Assumption: HydraSkript follows the standard Supabase pattern where
// Profile.id === auth.users.id. The upsert is safe whether or not a DB
// trigger already created the profile row.

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const DEMO_EMAIL = process.env.DEMO_EMAIL || "demo@hydraforge.tech";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "demo1234";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: 1,
  max: 5,
});

const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  // 1. Create (or reuse) the Supabase auth user.
  const { data: list } = await supabase.auth.admin.listUsers();
  const found = list?.users?.find((u) => u.email === DEMO_EMAIL);

  let userId;
  if (found) {
    userId = found.id;
    console.log(`reuse auth user ${userId}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`created auth user ${userId}`);
  }

  // 2. Upsert the Profile (id must mirror the auth user id).
  await prisma.profile.upsert({
    where: { id: userId },
    update: {
      email: DEMO_EMAIL,
      name: "Demo Author",
      tier: "free",
      purchasedCredits: 9999,
      lifetimeCredits: 9999,
      isLifetime: true,
      audiobookEnabled: true,
    },
    create: {
      id: userId,
      email: DEMO_EMAIL,
      name: "Demo Author",
      tier: "free",
      purchasedCredits: 9999,
      lifetimeCredits: 9999,
      isLifetime: true,
      audiobookEnabled: true,
    },
  });
  console.log("upserted profile");

  // 3. Seed a sample book (skip if one already exists for the demo user).
  const existingBook = await prisma.book.findFirst({ where: { ownerId: userId } });
  if (existingBook) {
    console.log(`demo book already exists (${existingBook.id}) — skipping`);
  } else {
    const book = await prisma.book.create({
      data: {
        ownerId: userId,
        title: "Demo: The Lighthouse Keeper’s Daughter",
        description: "A sample book generated to showcase the HydraSkript co-authoring flow.",
        genre: "fiction",
        targetAudience: "adult",
        status: "completed",
        outline: JSON.stringify({
          title: "The Lighthouse Keeper’s Daughter",
          chapters: [
            { title: "The Storm", synopsis: "A shipwreck strands a stranger." },
            { title: "The Letter", synopsis: "A hidden message changes everything." },
          ],
        }),
        chapters: {
          create: [
            {
              index: 0,
              title: "The Storm",
              wordTarget: 1500,
              status: "completed",
              approvalStatus: "approved",
              content:
                "Sample chapter content — this is a seeded demo book so visitors can explore the HydraSkript reader without creating their own.",
            },
            {
              index: 1,
              title: "The Letter",
              wordTarget: 1500,
              status: "completed",
              approvalStatus: "approved",
              content:
                "Sample chapter content — edit, regenerate, or export this book to see the full workflow.",
            },
          ],
        },
      },
    });
    console.log(`created demo book ${book.id}`);
  }

  console.log(`\nDemo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log("Paste this into the marketplace listing's demo_credentials field.");
  await prisma.$disconnect();
  await pool.end();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
