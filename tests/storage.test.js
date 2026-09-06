jest.mock('fs', () => ({
  existsSync: jest.fn(() => false),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));
jest.mock('@/lib/db', () => ({ db: { mediaAsset: { create: jest.fn() } } }));
jest.mock('@/lib/supabase', () => ({ getSupabaseAdmin: jest.fn() }));

const originalEnv = process.env;
let fs;
let bucket;
let from;
let getSupabaseAdmin;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnv, NODE_ENV: 'production', VERCEL: '1' };
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_STORAGE_BUCKET;

  fs = require('fs');
  getSupabaseAdmin = require('@/lib/supabase').getSupabaseAdmin;
  bucket = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    getPublicUrl: jest.fn().mockReturnValue({
      data: { publicUrl: 'https://project.supabase.co/storage/v1/object/public/hydraskript-assets/covers/test.png' },
    }),
    remove: jest.fn().mockResolvedValue({ error: null }),
    list: jest.fn().mockResolvedValue({ data: [{ name: 'test.png' }], error: null }),
  };
  from = jest.fn().mockReturnValue(bucket);
  getSupabaseAdmin.mockReturnValue({ storage: { from } });
});

afterEach(() => {
  process.env = originalEnv;
  jest.restoreAllMocks();
});

function configureSupabase(publicUrlOnly = true) {
  process.env[publicUrlOnly ? 'NEXT_PUBLIC_SUPABASE_URL' : 'SUPABASE_URL'] = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
}

function simulateReadOnlyDeployment() {
  fs.mkdirSync.mockImplementation(() => {
    throw new Error("ENOENT: no such file or directory, mkdir '/var/task/public/assets/covers'");
  });
  fs.writeFileSync.mockImplementation(() => {
    throw new Error('EROFS: read-only file system');
  });
}

test.each([false, true])('import never touches the filesystem (Supabase configured: %s)', (configured) => {
  if (configured) configureSupabase();
  simulateReadOnlyDeployment();
  expect(() => require('@/lib/utils/storage')).not.toThrow();
  expect(fs.existsSync).not.toHaveBeenCalled();
  expect(fs.mkdirSync).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
  expect(getSupabaseAdmin).not.toHaveBeenCalled();
});

test.each([false, true])('uploads to Supabase with either URL variable (public-only: %s)', async (publicUrlOnly) => {
  configureSupabase(publicUrlOnly);
  simulateReadOnlyDeployment();
  const { saveFile } = require('@/lib/utils/storage');
  const buffer = Buffer.from('image');
  const url = await saveFile('covers', 'test.png', buffer, { contentType: 'image/png' });
  expect(from).toHaveBeenCalledWith('hydraskript-assets');
  expect(bucket.upload).toHaveBeenCalledWith('covers/test.png', buffer, {
    upsert: true,
    contentType: 'image/png',
  });
  expect(url).toBe(bucket.getPublicUrl.mock.results[0].value.data.publicUrl);
  expect(fs.mkdirSync).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test('reads the bucket setting at operation time', async () => {
  const { saveFile } = require('@/lib/utils/storage');
  configureSupabase();
  process.env.SUPABASE_STORAGE_BUCKET = 'custom-assets';
  await saveFile('covers', 'test.png', Buffer.from('image'));
  expect(from).toHaveBeenCalledWith('custom-assets');
});

test('fails clearly without persistent storage on Vercel, without trying local disk', async () => {
  const { saveFile } = require('@/lib/utils/storage');
  await expect(saveFile('covers', 'test.png', Buffer.from('image')))
    .rejects.toThrow(/persistent storage.*not configured/i);
  expect(fs.mkdirSync).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test('does not fall back to disk after a Supabase upload failure', async () => {
  configureSupabase();
  bucket.upload.mockResolvedValue({ error: { message: 'Bucket not found' } });
  const { saveFile } = require('@/lib/utils/storage');
  await expect(saveFile('covers', 'test.png', Buffer.from('image')))
    .rejects.toThrow(/Bucket not found/);
  expect(fs.mkdirSync).not.toHaveBeenCalled();
  expect(fs.writeFileSync).not.toHaveBeenCalled();
});

test('local development creates only the requested directory when a file is saved', async () => {
  process.env.NODE_ENV = 'development';
  delete process.env.VERCEL;
  const { saveFile } = require('@/lib/utils/storage');
  expect(fs.mkdirSync).not.toHaveBeenCalled();
  const buffer = Buffer.from('file');
  await expect(saveFile('exports', 'test.pdf', buffer)).resolves.toBe('/assets/exports/test.pdf');
  const path = require('path');
  expect(fs.mkdirSync).toHaveBeenCalledTimes(1);
  expect(fs.mkdirSync).toHaveBeenCalledWith(path.join(process.cwd(), 'public/assets/exports'), { recursive: true });
  expect(fs.writeFileSync).toHaveBeenCalledWith(path.join(process.cwd(), 'public/assets/exports/test.pdf'), buffer);
});

test('delete and exists use Supabase with NEXT_PUBLIC_SUPABASE_URL', async () => {
  configureSupabase();
  const { deleteFile, fileExists } = require('@/lib/utils/storage');
  const url = 'https://project.supabase.co/storage/v1/object/public/hydraskript-assets/covers/test.png';
  await expect(fileExists(url)).resolves.toBe(true);
  await expect(deleteFile(url)).resolves.toBe(true);
  expect(bucket.list).toHaveBeenCalledWith('covers', { search: 'test.png' });
  expect(bucket.remove).toHaveBeenCalledWith(['covers/test.png']);
  expect(fs.existsSync).not.toHaveBeenCalled();
  expect(fs.unlinkSync).not.toHaveBeenCalled();
});
