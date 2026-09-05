'use client';

/**
 * Shared client helper for Stripe Checkout.
 * Unauthenticated users are sent to signup with a return URL that resumes checkout.
 */
export async function redirectToCheckout(opts: {
  endpoint: string;
  body?: unknown;
  loginNext: string;
}): Promise<string | null> {
  const response = await fetch(opts.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (response.status === 401) {
    const next = opts.loginNext.startsWith('/') ? opts.loginNext : `/${opts.loginNext}`;
    window.location.href = `/login?mode=signup&next=${encodeURIComponent(next)}`;
    return null;
  }

  let result: { success?: boolean; error?: string; data?: { checkoutUrl?: string } } = {};
  try {
    result = await response.json();
  } catch {
    return 'Unexpected response from checkout. Please try again.';
  }

  if (result.success && result.data?.checkoutUrl) {
    window.location.href = result.data.checkoutUrl;
    return null;
  }

  return result.error || 'Unable to start checkout.';
}

export function startFounderCheckout() {
  return redirectToCheckout({
    endpoint: '/api/checkout/founder',
    loginNext: '/pricing?checkout=founder',
  });
}

export function startPlanCheckout(pricingKey: string) {
  return redirectToCheckout({
    endpoint: '/api/credits/checkout',
    body: { pricingKey },
    loginNext: `/pricing?checkout=${encodeURIComponent(pricingKey)}`,
  });
}
