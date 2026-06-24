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
  mediaAssets?: MediaMetadata[];
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

export interface JobData {
  id: string;
  type: string;
  status: string;
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

export async function createBook(input: CreateBookInput) {
  return apiFetch<BookData>('/books', {
    method: 'POST',
    body: JSON.stringify(input),
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

// ✅ FIXED: All paths now use API_BASE
export async function listStyleProfiles() {
  return apiFetch<{ success: boolean; data: StyleProfileData[] }>('/training/style-profile');
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
