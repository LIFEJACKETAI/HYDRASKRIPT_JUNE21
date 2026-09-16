-- HydraSkript - index the job-claim query
--
-- The queue claims work with:
--   SELECT ... FROM jobs WHERE status = 'queued' AND (lease IS NULL OR lease <= now())
--   ORDER BY "createdAt" ASC LIMIT 1
--
-- That ran on every client poll (every ~5s per open book) and every pump kick.
-- Without a matching index Postgres filters by `status` using the
-- (status, leaseExpiresAt) index and then SORTS the whole queued set, so each
-- claim holds a pooled connection for longer than it should. Under load that is
-- what produced "Transaction API error: Unable to start a transaction in the
-- given time." (P2028) on the queue's own status updates - and a failed status
-- update is what strands a finished job at "Queued..." in the UI.
--
-- Apply with either:
--   npx prisma db push        (this matches prisma/schema.prisma)
-- or
--   npx prisma migrate deploy

CREATE INDEX IF NOT EXISTS "jobs_status_createdAt_idx" ON "jobs" ("status", "createdAt");
