const { getBookResult } = require('@/lib/api');

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = jest.fn();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

function reply(body, status = 200, contentType = 'application/json') {
  return new Response(contentType === 'application/json' ? JSON.stringify(body) : body, {
    status,
    headers: { 'content-type': contentType },
  });
}

test('an HTML 500 remains a server error, not a login error', async () => {
  global.fetch.mockResolvedValue(reply('<!DOCTYPE html><html>Server error</html>', 500, 'text/html'));
  const result = await getBookResult('book-id');
  expect(result.success).toBe(false);
  expect(result.status).toBe(500);
  expect(result.error).toMatch(/server error.*500/i);
  expect(result.error).not.toMatch(/authentication|login/i);
});

test('a JSON 500 preserves its status and error instead of looking like a missing book', async () => {
  global.fetch.mockResolvedValue(reply({ success: false, error: 'Database query failed' }, 500));
  await expect(getBookResult('book-id')).resolves.toEqual({
    success: false, status: 500, error: 'Database query failed',
  });
});

test('only an actual 404 is reported as a missing book', async () => {
  global.fetch.mockResolvedValue(reply({ success: false, error: 'Book not found' }, 404));
  await expect(getBookResult('book-id')).resolves.toEqual({
    success: false, status: 404, error: 'Book not found',
  });
});

test('JSON authentication failures keep their real status', async () => {
  global.fetch.mockResolvedValue(reply({ success: false, error: 'Authentication required' }, 401));
  await expect(getBookResult('book-id')).resolves.toEqual({
    success: false, status: 401, error: 'Authentication required',
  });
});

test('a real redirect to the login page is recognized', async () => {
  const response = reply('<html>Login</html>', 200, 'text/html');
  Object.defineProperties(response, {
    redirected: { value: true },
    url: { value: 'https://app.example.com/login?next=%2Fdashboard' },
  });
  global.fetch.mockResolvedValue(response);
  const result = await getBookResult('book-id');
  expect(result.success).toBe(false);
  expect(result.error).toBe('Authentication required');
});

test('a successful book response preserves its data', async () => {
  const book = { id: 'book-id', title: 'A saved draft' };
  global.fetch.mockResolvedValue(reply({ success: true, data: book }));
  await expect(getBookResult('book-id')).resolves.toEqual({ success: true, data: book, status: 200 });
});

test('a non-JSON upstream error is not echoed into the interface', async () => {
  global.fetch.mockResolvedValue(reply('Internal stack trace with deployment paths', 502, 'text/plain'));
  const result = await getBookResult('book-id');
  expect(result.error).toMatch(/server error.*502/i);
  expect(result.error).not.toContain('stack trace');
});

test('network failure stays distinguishable from a 404', async () => {
  global.fetch.mockRejectedValue(new Error('Failed to fetch'));
  const result = await getBookResult('book-id');
  expect(result.success).toBe(false);
  expect(result.status).toBeUndefined();
  expect(result.error).toBe('Failed to fetch');
});
