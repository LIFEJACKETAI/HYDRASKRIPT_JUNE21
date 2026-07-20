# Queue Activation Checklist

This project already uses a custom Supabase/Postgres SQL-backed queue.

The queue has been hardened in code, and the schema now includes the following staged fields on `Job`:

- `retryCount`
- `maxRetries`
- `leaseExpiresAt`
- `lastHeartbeatAt`

## Why this checklist exists

The runtime queue code is currently operating in a compatibility mode so the app remains stable even before the Prisma client is regenerated.

To activate the full DB-backed retry and lease path, run the following locally against the intended database:

```bash
npm run db:generate
npm run db:push
```

## After running those commands

Verify that the generated Prisma client includes the new `Job` fields.

Then the queue can be switched from compatibility mode to native field mode, which enables:

- explicit retry counters
- configurable max retry counts per job
- lease expiry for interrupted jobs
- heartbeat timestamps for long-running workers
- stronger future support for multi-instance workers

## Recommended follow-up after schema sync

1. Re-run:
   - `npx tsc --noEmit --incremental false`
   - `npx eslint src --ext .ts,.tsx`
   - `npm run build`
2. Test an intentionally failing job and confirm:
   - `retryCount` increments
   - job re-queues until `maxRetries`
   - refund happens only after final failure
3. Test app restart during an active job and confirm:
   - stale `active` jobs recover cleanly

## Current queue status

- safe for single-instance deployment
- basic retry behavior implemented in app logic
- full DB-backed lease path staged, pending Prisma regeneration and DB schema push
