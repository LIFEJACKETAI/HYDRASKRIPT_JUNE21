# Queue Activation Notes

## Current state

The application currently runs with a hardened compatibility queue in:

- `src/lib/workers/queue.ts`

That queue already provides:

- lazy bootstrap
- interrupted-job recovery
- basic retry behavior
- no import-time DB side effects

## Why full lease-mode is not switched on yet

The Prisma schema has already been updated with the following `Job` fields:

- `retryCount`
- `maxRetries`
- `leaseExpiresAt`
- `lastHeartbeatAt`

However, the generated Prisma client in your local environment must also be refreshed before the app can safely use those fields directly in TypeScript queries.

## Activation commands

Run these from the project root:

```bash
npm run db:generate
npm run db:push
```

## After activation

Once those commands succeed, the next queue pass should:

1. switch `src/lib/workers/queue.ts` from compatibility retry parsing to field-backed retry reads
2. use `leaseExpiresAt` in active-job recovery
3. update workers to heartbeat during long-running steps
4. optionally add a small admin/health view for queue metrics

## Recommended rollout

1. Run the two Prisma commands above
2. Start the app locally
3. Trigger one outline job and one audiobook/image job
4. Verify jobs move through `queued -> active -> completed`
5. Then finish the lease-backed queue activation in code
