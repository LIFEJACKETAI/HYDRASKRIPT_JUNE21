/**
 * Regression tests for the storage backend selection.
 *
 * Production audiobook generation failed with
 *   ENOENT: no such file or directory, mkdir '/var/task/public/assets/audio-chunks'
 * because `isSupabaseStorageEnabled()` only looked at `SUPABASE_URL`, while the
 * documented (and actually configured) variable is `NEXT_PUBLIC_SUPABASE_URL`.
 * Detection failed, `saveFile()` fell through to the local-filesystem branch, and
 * Vercel's read-only disk rejected the write.
 *
 * These tests call the REAL `saveFile()` — not a re-implementation — with the
 * Supabase client and fs mocked, so a regression re-introduces a thrown error.
 */

jest.mock('@/lib/db', () => ({ db: {} }));

const mockUpload = jest.fn();
const mockGetPublicUrl = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => mockUpload(...args),
        getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
      }),
    },
  },
}));

// Mock the real fs so a regression that reaches the local-filesystem branch
// cannot escape a file into the working tree.
const fsMock = {
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
};
jest.mock('fs', () => fsMock);

const ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STORAGE_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_KEY',
  'R2_ACCOUNT_ID',
  'VERCEL',
] as const;

type StorageModule = typeof import('@/lib/utils/storage');

/** Fresh module instance so module-level config caches cannot leak between cases. */
async function loadStorage(env: Record<string, string | undefined>): Promise<StorageModule> {
  for (const key of ENV_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  jest.resetModules();
  return import('@/lib/utils/storage');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null });
  mockGetPublicUrl.mockReturnValue({
    data: { publicUrl: 'https://proj.supabase.co/storage/v1/object/public/hydraskript-assets/audio-chunks/f.wav' },
  });
  fsMock.existsSync.mockReturnValue(false);
});

describe('storage backend detection', () => {
  it('enables Supabase Storage when only NEXT_PUBLIC_SUPABASE_URL is set (the documented var)', async () => {
    const storage = await loadStorage({
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    });

    expect(storage.isSupabaseStorageEnabled()).toBe(true);
    expect(storage.getSupabaseUrl()).toBe('https://proj.supabase.co');
    expect(storage.getSupabaseStorageBucket()).toBe('hydraskript-assets');
  });

  it('still honours the legacy SUPABASE_URL name', async () => {
    const storage = await loadStorage({
      SUPABASE_URL: 'https://legacy.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
      SUPABASE_STORAGE_BUCKET: 'custom-bucket',
    });

    expect(storage.isSupabaseStorageEnabled()).toBe(true);
    expect(storage.getSupabaseUrl()).toBe('https://legacy.supabase.co');
    expect(storage.getSupabaseStorageBucket()).toBe('custom-bucket');
  });

  it('stays disabled without the service role key', async () => {
    const storage = await loadStorage({
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
    });

    expect(storage.isSupabaseStorageEnabled()).toBe(false);
  });
});

describe('saveFile', () => {
  it('uploads audiobook chunks to Supabase and returns the public URL', async () => {
    const storage = await loadStorage({
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    });

    const url = await storage.saveFile('audio-chunks', 'chunk_1.wav', Buffer.from('RIFF'), {
      contentType: 'audio/wav',
    });

    expect(mockUpload).toHaveBeenCalledWith(
      'audio-chunks/chunk_1.wav',
      expect.any(Buffer),
      expect.objectContaining({ upsert: true, contentType: 'audio/wav' })
    );
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    expect(fsMock.mkdirSync).not.toHaveBeenCalled();
    expect(url).toBe(
      'https://proj.supabase.co/storage/v1/object/public/hydraskript-assets/audio-chunks/f.wav'
    );
  });

  it('fails with a configuration error on a read-only serverless runtime instead of writing to disk', async () => {
    const storage = await loadStorage({ VERCEL: '1' });

    await expect(
      storage.saveFile('audio-chunks', 'chunk_1.wav', Buffer.from('RIFF'))
    ).rejects.toThrow(/read-only disk/);

    expect(fsMock.mkdirSync).not.toHaveBeenCalled();
    expect(fsMock.writeFileSync).not.toHaveBeenCalled();
  });

  it('names the missing environment variables in that error', async () => {
    const storage = await loadStorage({
      VERCEL: '1',
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
    });

    await expect(
      storage.saveFile('audio-chunks', 'chunk_1.wav', Buffer.from('RIFF'))
    ).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('still writes locally in a non-serverless environment with no cloud storage', async () => {
    const storage = await loadStorage({});

    const url = await storage.saveFile('exports', 'book.pdf', Buffer.from('%PDF'));

    expect(fsMock.writeFileSync).toHaveBeenCalled();
    expect(url).toBe('/assets/exports/book.pdf');
  });
});
