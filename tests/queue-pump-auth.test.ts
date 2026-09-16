import { isPumpRequestAuthorized } from '@/lib/workers/queue-pump-client';

type HeaderMap = Record<string, string>;

function request(headers: HeaderMap = {}) {
  return {
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? null;
      },
    },
  };
}

describe('queue pump authentication', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalCronSecret = process.env.CRON_SECRET;
  const originalQueueSecret = process.env.QUEUE_PUMP_SECRET;
  const originalDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = 'test-cron-secret';
    delete process.env.QUEUE_PUMP_SECRET;
    delete process.env.VERCEL_DEPLOYMENT_ID;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
    if (originalQueueSecret === undefined) delete process.env.QUEUE_PUMP_SECRET;
    else process.env.QUEUE_PUMP_SECRET = originalQueueSecret;
    if (originalDeploymentId === undefined) delete process.env.VERCEL_DEPLOYMENT_ID;
    else process.env.VERCEL_DEPLOYMENT_ID = originalDeploymentId;
  });

  it('accepts the configured secret in the supported header forms', () => {
    expect(
      isPumpRequestAuthorized(request({ authorization: 'Bearer test-cron-secret' }))
    ).toBe(true);
    expect(
      isPumpRequestAuthorized(request({ 'x-queue-pump-secret': 'test-cron-secret' }))
    ).toBe(true);
  });

  it('rejects unauthenticated and forged Vercel-looking headers in production', () => {
    expect(isPumpRequestAuthorized(request())).toBe(false);
    expect(isPumpRequestAuthorized(request({ 'x-vercel-cron': '1' }))).toBe(false);
    expect(isPumpRequestAuthorized(request({ 'user-agent': 'vercel-cron/1.0' }))).toBe(false);
  });
});
