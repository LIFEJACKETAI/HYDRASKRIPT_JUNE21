import { NextRequest, NextResponse } from 'next/server';
import { middleware } from '@/middleware';
import { updateSession } from '@/lib/supabase/middleware';

jest.mock('@/lib/supabase/middleware', () => ({
  updateSession: jest.fn(),
}));

const updateSessionMock = updateSession as jest.MockedFunction<typeof updateSession>;

function request(path: string, headers?: Record<string, string>) {
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe('middleware server-to-server API allowlist', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateSessionMock.mockResolvedValue({
      supabaseResponse: NextResponse.next(),
      user: null,
    });
  });

  it('lets the queue pump reach its route-level secret check without a session', async () => {
    const response = await middleware(request('/api/queue/pump?stats=1'));

    expect(response.status).toBe(200);
    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it('keeps ordinary API routes behind the Supabase session gate', async () => {
    const response = await middleware(request('/api/jobs/job-1'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Authentication required',
    });
    expect(updateSessionMock).toHaveBeenCalledTimes(1);
  });

  it('does not let a similarly named path bypass the gate', async () => {
    const response = await middleware(request('/api/queue/pump-extra'));

    expect(response.status).toBe(401);
    expect(updateSessionMock).toHaveBeenCalledTimes(1);
  });
});
