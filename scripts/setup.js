#!/usr/bin/env node
// Setup script: creates .env from .env.example if missing, then runs prisma db push

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('[setup] No .env found — generating from .env.example...');
  const dbPath = path.join(root, 'prisma', 'dev.db');
  const envContent = `DATABASE_URL="file:${dbPath}"\n`;
  fs.writeFileSync(envPath, envContent);
  console.log(`[setup] Created .env with DATABASE_URL pointing to ${dbPath}`);
} else {
  console.log('[setup] .env already exists — skipping creation.');
}

console.log('[setup] Running prisma db push...');
try {
  execSync('node_modules/.bin/prisma db push', { cwd: root, stdio: 'inherit' });
  console.log('[setup] Database ready.');
} catch (e) {
  console.error('[setup] prisma db push failed:', e.message);
  process.exit(1);
}
