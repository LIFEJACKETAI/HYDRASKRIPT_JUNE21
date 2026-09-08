// HydraSkript - API Client
// Centralized API client for all frontend-to-backend communication

const API_BASE = '/api';

// ─── Fetch Helper ─────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    // Check if response is JSON before parsing
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      // If it's HTML (login page), treat as auth failure
      if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
        console.warn(`[API Client] ${path} returned HTML (likely login redirect)`);
        return { success: false, error: 'Authentication required' };
      }
      return { success: false, error: `Unexpected response: ${text.slice(0, 100)}` };
    }

    const result = await response.json();
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[API DEBUG] ${path} →`, response.status, result);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    console.error(`[API Client] ${path} failed:`, message);
    return { success: false, error: message };
  }
}

// ─── Profile API ──────────────────────────────────────────────────────────────

export interface ProfileData {
  id: string;
  email: string;
  name: string;
  credits: number;
  tier: string;
  isAdmin: boolean;
  founderBadge?: boolean;
  isLifetime?: boolean;
  createdAt: string;
}

export async function getProfile(): Promise<ProfileData | null> {
  const result = await apiFetch<ProfileData>('/profile');
  return result.success ? result.data ?? null : null;
}

export async function getUserEmail(): Promise<string | null> {
  const profile = await getProfile();
  return profile?.email ?? null;
}

export async function setUserEmail(_email: string) {
  return Promise.resolve();
}

export async function updateProfile(name: string) {
  return apiFetch<ProfileData>('/profile', {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

// ─── Books API ────────────────────────────────────────────────────────────────

export interface BookData {
  id: string;
  title: string;
  genre: string;
  targetAudience: string;
  status: string;
  coverImageUrl: string | null;
  totalCreditsEstimated: number;
  totalCreditsCharged: number;
  maxPages: number;
  styleProfileId: string | null;
  outline: string;
  chapters: ChapterData[];
  styleProfile?: { id: string; name: string };
  jobs?: JobData[];
  mediaAssets?: MediaAssetData[];
  createdAt: string;
  updatedAt: string;
}

export interface ChapterData {
  id: string;
  index: number;
  title: string;
  synopsis: string;
  wordTarget: number;
  content: string;
  wordCount: number;
  status: string;
  charactersIntroduced: string;
  summaryForNext: string;
  illustrationUrl: string | null;
  illustrationPrompt: string;
  generationJobId: string | null;
}

export interface MediaAssetData {
  id: string;
  assetType: string;
  publicUrl: string;
  metadata: string;
  createdAt: string;
}

export interface CreateBookInput {
  title: string;
  description?: string;
  genre: string;
  targetAudience: string;
  coloringTheme?: string;
  styleProfileId?: string;
  chapterCount?: number;
  adventureType?: string;
  characterNames?: string[];
}

export async function listBooks(): Promise<BookData[]> {
  const result = await apiFetch<BookData[]>('/books');
  return result.data ?? [];
}

export async function getBook(id: string): Promise<BookData | null> {
  const result = await apiFetch<BookData>(`/books/${id}`);
  return result.data ?? null;
}

export async function createBook(input: CreateBookInput) {
  return apiFetch<BookData>('/books', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteBook(id: string) {
  return apiFetch(`/books/${id}`, { method: 'DELETE' });
}

export async function startGeneration(bookId: string) {
  return apiFetch<{ jobId: string; estimatedCredits: number }>(
    `/books/${bookId}/generate`,
    { method: 'POST' }
  );
}

export async function exportBook(bookId: string, format: string = 'pdf') {
  return apiFetch<{ downloadUrl: string; format: string }>(`/books/${bookId}/export`, {
    method: 'POST',
    body: JSON.stringify({ format }),
  });
}

// ─── Jobs API ─────────────────────────────────────────────────────────────────

export interface JobData {
  id: string;
  jobType: string;
  status: string;
  progressMessage: string;
  progressPercent: number;
  creditsReserved: number;
  creditsConsumed: number;
  errorMessage: string | null;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export async function getJob(jobId: string): Promise<JobData | null> {
  const result = await apiFetch<JobData>(`/jobs/${jobId}`);
  return result.data ?? null;
}

// ─── Credits API ──────────────────────────────────────────────────────────────

export interface CreditsData {
  credits: number;
  tier: string;
  founderCount?: number;
  recentTransactions: {
    id: string;
    amount: number;
    reason: string;
    createdAt: string;
  }[];
}

export async function getCredits(): Promise<CreditsData | null> {
  const result = await apiFetch<CreditsData>('/credits');
  return result.data ?? null;
}

export async function purchaseCredits(pricingKey: string) {
  return apiFetch<{ checkoutUrl: string; sessionId: string }>('/credits/checkout', {
    method: 'POST',
    body: JSON.stringify({ pricingKey }),
  });
}

// ─── Style Profiles API ──────────────────────────────────────────────────────

export interface StyleProfileData {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  preview: string;
  exemplarTexts: string[];
  createdAt: string;
}

export async function listStyleProfiles(): Promise<StyleProfileData[]> {
  const result = await apiFetch<StyleProfileData[]>('/training/style-profile');
  return result.data ?? [];
}

export async function createStyleProfile(input: {
  name: string;
  description?: string;
  exemplarTexts: string[];
}) {
  return apiFetch('/training/style-profile', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function deleteStyleProfile(profileId: string) {
  return apiFetch('/training/style-profile', {
    method: 'DELETE',
    body: JSON.stringify({ profileId }),
  });
}

// ─── Admin API ────────────────────────────────────────────────────────────────

export interface AdminData {
  analytics: {
    totalUsers: number;
    totalBooks: number;
    completedBooks: number;
    failedBooks: number;
    totalCreditsConsumed: number;
    jobStats: { queued: number; active: number; completed: number; failed: number };
  };
  jobs: {
    id: string;
    jobType: string;
    status: string;
    progressMessage: string;
    progressPercent: number;
    creditsReserved: number;
    creditsConsumed: number;
    errorMessage: string | null;
    book: { id: string; title: string } | null;
    owner: { id: string; email: string; name: string };
    createdAt: string;
    completedAt: string | null;
  }[];
}

export async function getAdminData(): Promise<AdminData | null> {
  const result = await apiFetch<AdminData>('/admin');
  return result.data ?? null;
}
// ─── Story Bible API ──────────────────────────────────────────────────────────

export type StoryBibleKind = 'CHARACTER' | 'LOCATION' | 'OBJECT' | 'THEME' | 'HISTORY';

export interface StoryBibleEntity {
  id: string;
  bookId: string;
  kind: StoryBibleKind;
  name: string;
  role: string;
  summary: string;
  motivation: string;
  description: string;
  physicalTraits: { tags: string[]; notes: string };
  secrets: { confidential: string; isPrivate: boolean };
  portraitUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StoryBiblePayload = Partial<
  Pick<
    StoryBibleEntity,
    'kind' | 'name' | 'role' | 'summary' | 'motivation' | 'description' | 'portraitUrl'
  >
> & {
  physicalTraits?: { tags: string[]; notes: string };
  secrets?: { confidential: string; isPrivate: boolean };
};

export async function listStoryBibleEntities(bookId: string, kind?: StoryBibleKind) {
  const query = kind ? `?bookId=${encodeURIComponent(bookId)}&kind=${kind}` : `?bookId=${encodeURIComponent(bookId)}`;
  return apiFetch<StoryBibleEntity[]>(`/story-bible${query}`);
}

export async function getStoryBibleEntity(id: string) {
  return apiFetch<StoryBibleEntity>(`/story-bible/${id}`);
}

export async function createStoryBibleEntity(bookId: string, payload: StoryBiblePayload) {
  return apiFetch<StoryBibleEntity>('/story-bible', {
    method: 'POST',
    body: JSON.stringify({ bookId, ...payload }),
  });
}

export async function updateStoryBibleEntity(id: string, payload: StoryBiblePayload) {
  return apiFetch<StoryBibleEntity>(`/story-bible/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteStoryBibleEntity(id: string) {
  return apiFetch<{ ok: true }>(`/story-bible/${id}`, { method: 'DELETE' });
}

export interface ManuscriptImportResult {
  fileName: string;
  counts: Record<string, number>;
  total: number;
  bookId?: string;
}

export interface ManuscriptImportProgress {
  percent: number;
  message: string;
}

export type ManuscriptImportResponse =
  | { success: true; data: ManuscriptImportResult }
  | { success: false; error: string };

interface ManuscriptImportStart {
  success: boolean;
  error?: string;
  data?: {
    jobId: string;
    bookId?: string | null;
    fileName?: string;
    textLength?: number;
    status?: string;
    progressMessage?: string;
    progressPercent?: number;
  };
}

interface ManuscriptImportJobStatus {
  jobId: string;
  bookId: string | null;
  status: string;
  progressMessage: string | null;
  progressPercent: number;
  errorMessage: string | null;
  fileName?: string;
  newBookCreated?: boolean;
  counts?: Record<string, number>;
  total?: number;
}

/**
 * Vercel rejects a Serverless Function request body larger than 4.5 MB before
 * the app ever sees it. Keep in sync with MAX_MANUSCRIPT_UPLOAD_BYTES in
 * `src/lib/manuscript.ts`.
 */
const MAX_MANUSCRIPT_UPLOAD_BYTES = 4.5 * 1024 * 1024;
/** Upload + server-side text extraction. The LLM work happens after this. */
const IMPORT_UPLOAD_TIMEOUT_MS = 120_000;
const IMPORT_POLL_INTERVAL_MS = 2500;
const IMPORT_POLL_TIMEOUT_MS = 20_000;
/** The server caps one LLM chain at 240s and the queue may retry the job. */
const IMPORT_POLL_DEADLINE_MS = 10 * 60 * 1000;
/** Consecutive failed polls tolerated before giving up (Wi-Fi handover, etc.). */
const IMPORT_MAX_POLL_FAILURES = 5;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function manuscriptGatewayError(status: number): string {
  if (status === 504 || status === 502 || status === 503) {
    return 'The server timed out while receiving that manuscript. Try a smaller file (or a .txt instead of a .pdf) and try again.';
  }
  if (status === 413) {
    return 'That manuscript is too large to upload. Please keep it under 4.5 MB.';
  }
  if (status === 401) {
    return 'Your session expired. Please sign in again, then re-upload the manuscript.';
  }
  return `Import failed (server error ${status}). Please try again.`;
}

async function readImportStartResponse(response: Response): Promise<ManuscriptImportStart> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return (await response.json()) as ManuscriptImportStart;
    } catch {
      // fall through to the gateway message
    }
  }
  return { success: false, error: manuscriptGatewayError(response.status) };
}

/**
 * Upload a manuscript and build its Story Bible.
 *
 * The server queues the extraction as a job and answers in ~1-2s, so this
 * function polls `/api/story-bible/import-manuscript/[jobId]` until the job
 * completes. That keeps a full-length manuscript off the HTTP request path —
 * the old synchronous version was killed by Vercel's function timeout and the
 * browser only ever saw a bodyless 504.
 *
 * @param onProgress optional callback for the progress bar / status line.
 */
export async function importManuscriptToStoryBible(
  bookId: string | null,
  file: File,
  onProgress?: (progress: ManuscriptImportProgress) => void
): Promise<ManuscriptImportResponse> {
  // Fail fast on oversized files instead of letting the platform reject them.
  if (file.size > MAX_MANUSCRIPT_UPLOAD_BYTES) {
    return {
      success: false,
      error:
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — uploads are limited to 4.5 MB. ` +
        `Re-save the manuscript as a plain .txt (or a text-based PDF rather than a scan) and try again.`,
    };
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!['txt', 'pdf', 'docx'].includes(extension)) {
    return { success: false, error: 'Please upload a .txt, .pdf, or .docx manuscript.' };
  }

  const formData = new FormData();
  if (bookId) formData.append('bookId', bookId);
  formData.append('file', file);

  onProgress?.({ percent: 2, message: `Uploading "${file.name}"...` });

  // ── 1. Hand the file over and get a job id back ───────────────────────────
  let jobId: string;
  let queuedBookId: string | null = bookId;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMPORT_UPLOAD_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch('/api/story-bible/import-manuscript', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const body = await readImportStartResponse(response);
    if (!response.ok || body.success !== true || !body.data?.jobId) {
      return { success: false, error: body.error || manuscriptGatewayError(response.status) };
    }

    jobId = body.data.jobId;
    queuedBookId = body.data.bookId ?? queuedBookId;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        error: 'The upload took too long and was stopped. Please check your connection and try again.',
      };
    }
    return {
      success: false,
      error:
        'Lost connection to the server while uploading the manuscript (your network may have changed). ' +
        'Keep this tab open and try again.',
    };
  }

  // ── 2. Poll until the import job finishes ─────────────────────────────────
  const deadline = Date.now() + IMPORT_POLL_DEADLINE_MS;
  let consecutiveFailures = 0;

  while (Date.now() < deadline) {
    await wait(IMPORT_POLL_INTERVAL_MS);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), IMPORT_POLL_TIMEOUT_MS);
    let status;
    try {
      status = await apiFetch<ManuscriptImportJobStatus>(
        `/story-bible/import-manuscript/${jobId}`,
        { signal: controller.signal }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!status.success || !status.data) {
      // A dropped poll is not a failed import — the job keeps running server
      // side, so retry a few times before telling the user anything went wrong.
      consecutiveFailures += 1;
      if (consecutiveFailures >= IMPORT_MAX_POLL_FAILURES) {
        return {
          success: false,
          error:
            'Lost contact with the server while the manuscript was being imported. ' +
            'The import may still finish in the background — reload the Story Bible in a minute to check.',
        };
      }
      onProgress?.({ percent: 50, message: 'Reconnecting to the server...' });
      continue;
    }

    consecutiveFailures = 0;
    const job = status.data;

    onProgress?.({
      percent: Math.max(0, Math.min(100, job.progressPercent ?? 0)),
      message: job.progressMessage || 'Importing your manuscript...',
    });

    if (job.status === 'completed') {
      const resolvedBookId = job.bookId ?? queuedBookId ?? undefined;
      return {
        success: true,
        data: {
          fileName: job.fileName ?? file.name,
          counts: job.counts ?? {},
          total: job.total ?? 0,
          ...(resolvedBookId ? { bookId: resolvedBookId } : {}),
        },
      };
    }

    if (job.status === 'failed') {
      return {
        success: false,
        error: job.errorMessage || 'The manuscript import failed. Please try again.',
      };
    }
  }

  return {
    success: false,
    error:
      'The import is taking much longer than expected. It may still be running — reload the Story Bible ' +
      'in a few minutes, or try a smaller excerpt.',
  };
}

export interface IdeaTransferInput {
  bookId: string;
  ideaText: string;
  title?: string;
  blurb?: string;
  chapters?: { number: number; title: string; synopsis: string }[];
  coverConcept?: string;
}

export async function transferIdeaToStoryBible(input: IdeaTransferInput) {
  return apiFetch<{ entities: StoryBibleEntity[]; total: number }>('/story-bible/transfer', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ─── Editorial Review API ─────────────────────────────────────────────────────

export type EditorialSeverity = 'critical' | 'warning' | 'info';
export type EditorialCategory =
  | 'TIMELINE'
  | 'CHARACTER'
  | 'CONTINUITY'
  | 'CROSS_REFERENCE'
  | 'PLOT_HOLE'
  | 'LOCATION'
  | 'POV'
  | 'FACTUAL'
  | 'DIALOGUE'
  | 'OTHER';
export type EditorialFindingStatus = 'open' | 'fixed' | 'ignored';

export interface EditorialReviewSummary {
  id: string;
  bookId: string | null;
  scope: 'book' | 'manuscript';
  sourceLabel: string;
  status: 'queued' | 'active' | 'completed' | 'failed';
  textLength: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  findingCount: number;
}

export interface EditorialFindingData {
  id: string;
  reviewId: string;
  severity: EditorialSeverity;
  category: EditorialCategory;
  title: string;
  description: string;
  quote: string;
  location: string;
  bookTitle: string;
  suggestion: string;
  status: EditorialFindingStatus;
  createdAt: string;
}

export interface EditorialReviewDetail extends EditorialReviewSummary {
  findings: EditorialFindingData[];
}

export async function runEditorialReview(input: {
  bookIds?: string[];
  file?: File;
  title?: string;
}) {
  const formData = new FormData();
  if (input.bookIds && input.bookIds.length > 0) {
    formData.append('bookIds', JSON.stringify(input.bookIds));
  }
  if (input.file) {
    formData.append('file', input.file);
  }
  if (input.title) {
    formData.append('title', input.title);
  }
  const response = await fetch('/api/universe/review', {
    method: 'POST',
    body: formData,
  });
  return (await response.json()) as {
    success: boolean;
    data?: { reviewId: string; jobId: string };
    error?: string;
  };
}

export async function listEditorialReviews(): Promise<EditorialReviewSummary[]> {
  const result = await apiFetch<EditorialReviewSummary[]>('/universe/review');
  return result.data ?? [];
}

export async function getEditorialReview(id: string) {
  return apiFetch<EditorialReviewDetail>(`/universe/review/${id}`);
}

export async function updateEditorialFindingStatus(
  reviewId: string,
  findingId: string,
  status: EditorialFindingStatus
) {
  return apiFetch<{ id: string; status: string }>(
    `/universe/review/${reviewId}/finding/${findingId}`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
}

export async function deleteEditorialReview(id: string) {
  return apiFetch<{ deleted: boolean }>(`/universe/review/${id}`, {
    method: 'DELETE',
  });
}
