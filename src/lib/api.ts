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
    console.log(`[API DEBUG] ${path} →`, response.status, result);
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

export async function exportBook(bookId: string) {
  return apiFetch<{ downloadUrl: string }>(`/books/${bookId}/export`, {
    method: 'POST',
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
  entities: StoryBibleEntity[];
  counts: Record<string, number>;
  total: number;
}

export async function importManuscriptToStoryBible(bookId: string, file: File) {
  const formData = new FormData();
  formData.append('bookId', bookId);
  formData.append('file', file);
  const response = await fetch('/api/story-bible/import-manuscript', {
    method: 'POST',
    body: formData,
  });
  return (await response.json()) as {
    success: boolean;
    data?: ManuscriptImportResult;
    error?: string;
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
