// HydraSkript - Shared TypeScript Interfaces & Types
// All domain types for the book generation platform

// ─── Enums ────────────────────────────────────────────────────────────────────

export type Tier = 'starter' | 'author' | 'publisher' | 'studio';
export type TargetAudience = 'adult' | '0-5' | '6-9' | '10-14';
export type BookStatus = 'draft' | 'generating' | 'completed' | 'failed';
export type ChapterStatus = 'pending' | 'writing' | 'reviewing' | 'completed' | 'failed';
export type JobStatus = 'queued' | 'active' | 'completed' | 'failed';
export type JobType = 'generate_outline' | 'write_chapter' | 'generate_image' | 'generate_audiobook' | 'export_pdf' | 'finalize_book';
export type AssetType = 'cover' | 'illustration' | 'coloring_page' | 'audiobook_chapter' | 'audiobook_complete' | 'pdf_export';
export type Genre = 'fiction' | 'non-fiction' | 'fantasy' | 'sci-fi' | 'mystery' | 'romance' | 'horror' | 'children' | 'coloring' | 'poetry' | 'self-help' | 'biography';

export type ColoringTheme = 'mandalas' | 'undersea-creatures' | 'birds' | 'animals-of-the-wild' | 'famous-landmarks' | 'exotic-sports-cars' | 'flowers-gardens' | 'fantasy-dragons' | 'zen-patterns' | 'architectural-details' | 'butterflies-insects' | 'vintage-botanicals';

// ─── Book Generation Types ────────────────────────────────────────────────────

export interface OutlineChapter {
  title: string;
  synopsis: string;
  wordTarget: number;
}

export interface BookOutline {
  title: string;
  chapters: OutlineChapter[];
}

export interface ChapterGenerationResult {
  content: string;
  charactersIntroduced: string[];
  summaryForNextChapter: string;
}

// ─── Style Profile Types ─────────────────────────────────────────────────────

export interface StyleProfileData {
  id: string;
  name: string;
  description: string;
  exemplarTexts: string[];
  systemPrompt: string;
}

// ─── Credit System Types ──────────────────────────────────────────────────────

export interface CreditCostTable {
  chapterPerThousandWords: number;  // 5 credits per 1000 words
  image: number;                    // 10 credits each
  audiobookBase: number;            // 50 credits base
  audiobookPerMinute: number;       // 1 credit per minute
  exportPdf: number;                // 2 credits
  outlineGeneration: number;        // 3 credits
}

export const CREDIT_COSTS: CreditCostTable = {
  chapterPerThousandWords: 5,   // Value-based: 5 credits per 1k words to support steering/edits
  image: 10,                    // Premium: 10 credits for consistency-checked art
  audiobookBase: 20,            // 20 credits base
  audiobookPerMinute: 2,        // 2 credits per minute
  exportPdf: 5,                 // 5 credits for professional POD formatting
  outlineGeneration: 5,         // 5 credits for the Story Blueprint
};

// ─── Target Audience Config ───────────────────────────────────────────────────

export const AUDIENCE_CONFIG: Record<TargetAudience, { maxPages: number; defaultChapters: number; wordsPerChapter: number; illustrationStyle: string }> = {
  'adult':    { maxPages: 600, defaultChapters: 10, wordsPerChapter: 1500, illustrationStyle: 'none' },
  '10-14':    { maxPages: 25,  defaultChapters: 25, wordsPerChapter: 600,  illustrationStyle: 'pixar' },
  '6-9':      { maxPages: 15,  defaultChapters: 15, wordsPerChapter: 350,  illustrationStyle: 'pixar' },
  '0-5':      { maxPages: 8,   defaultChapters: 8,  wordsPerChapter: 80,   illustrationStyle: 'pixar' },
};

// ─── Coloring Book Themes ─────────────────────────────────────────────────────

export const COLORING_THEMES: Record<ColoringTheme, { label: string; description: string; coverPrompt: string; pagePromptPrefix: string; icon: string }> = {
  'mandalas': {
    label: 'Mandalas',
    description: 'Intricate circular patterns for meditative coloring',
    coverPrompt: 'Beautiful mandala coloring book cover, intricate circular sacred geometry patterns, symmetrical design, ornate details',
    pagePromptPrefix: 'Intricate mandala design with',
    icon: '🏵️',
  },
  'undersea-creatures': {
    label: 'Undersea Creatures',
    description: 'Whales, octopuses, seahorses, and coral reefs',
    coverPrompt: 'Undersea creatures coloring book cover, whale, octopus, seahorse, coral reef, underwater ocean scene, detailed line art',
    pagePromptPrefix: 'Detailed undersea creature,', 
    icon: '🐙',
  },
  'birds': {
    label: 'Birds',
    description: 'Exotic birds, songbirds, birds of prey, and tropical parrots',
    coverPrompt: 'Birds coloring book cover, exotic parrots, eagle, hummingbird, detailed feathers, beautiful avian illustrations',
    pagePromptPrefix: 'Detailed bird illustration,',
    icon: '🦅',
  },
  'animals-of-the-wild': {
    label: 'Animals of the Wild',
    description: 'Lions, elephants, wolves, tigers, and majestic wildlife',
    coverPrompt: 'Wild animals coloring book cover, lion, elephant, wolf, tiger, majestic wildlife, detailed fur and features',
    pagePromptPrefix: 'Wild animal in natural habitat,',
    icon: '🦁',
  },
  'famous-landmarks': {
    label: 'Famous Landmarks',
    description: 'Eiffel Tower, Taj Mahal, Pyramids, and world architecture',
    coverPrompt: 'World landmarks coloring book cover, Eiffel Tower, Taj Mahal, Great Pyramids, Colosseum, architectural details',
    pagePromptPrefix: 'Famous world landmark,', 
    icon: '🏛️',
  },
  'exotic-sports-cars': {
    label: 'Exotic Sports Cars',
    description: 'Ferraris, Lamborghinis, Porsches, and supercars',
    coverPrompt: 'Exotic sports cars coloring book cover, Ferrari, Lamborghini, Porsche, sleek automotive design, detailed car illustrations',
    pagePromptPrefix: 'Detailed exotic sports car,',
    icon: '🏎️',
  },
  'flowers-gardens': {
    label: 'Flowers & Gardens',
    description: 'Roses, sunflowers, botanical gardens, and floral arrangements',
    coverPrompt: 'Flowers and gardens coloring book cover, roses, sunflowers, botanical garden, floral arrangements, detailed petals',
    pagePromptPrefix: 'Detailed flower or garden scene,',
    icon: '🌹',
  },
  'fantasy-dragons': {
    label: 'Fantasy & Dragons',
    description: 'Dragons, castles, wizards, and mythical creatures',
    coverPrompt: 'Fantasy dragons coloring book cover, dragon, castle, wizard, mythical creatures, epic fantasy scene, detailed scales',
    pagePromptPrefix: 'Fantasy dragon or mythical creature,',
    icon: '🐉',
  },
  'zen-patterns': {
    label: 'Zen Patterns',
    description: 'Calming abstract patterns, waves, and flowing designs',
    coverPrompt: 'Zen patterns coloring book cover, flowing abstract patterns, calming waves, meditative swirls, peaceful designs',
    pagePromptPrefix: 'Calming zen pattern with,', 
    icon: '☯️',
  },
  'architectural-details': {
    label: 'Architectural Details',
    description: 'Gothic cathedrals, Art Deco, Victorian, and ornate buildings',
    coverPrompt: 'Architectural details coloring book cover, gothic cathedral, art deco, Victorian ornament, ornate building details',
    pagePromptPrefix: 'Detailed architectural element,',
    icon: '🏰',
  },
  'butterflies-insects': {
    label: 'Butterflies & Insects',
    description: 'Butterflies, moths, beetles, and delicate wing patterns',
    coverPrompt: 'Butterflies and insects coloring book cover, monarch butterfly, luna moth, beetle, delicate wing patterns, detailed insects',
    pagePromptPrefix: 'Detailed butterfly or insect with intricate wing patterns,',
    icon: '🦋',
  },
  'vintage-botanicals': {
    label: 'Vintage Botanicals',
    description: 'Classic botanical illustrations, herbs, and scientific plant drawings',
    coverPrompt: 'Vintage botanicals coloring book cover, classic botanical illustration style, herbs, ferns, scientific plant drawings, vintage aesthetic',
    pagePromptPrefix: 'Vintage botanical illustration of,',
    icon: '🌿',
  },
};

// ─── Image Style Config ───────────────────────────────────────────────────────

export const STYLE_CONFIG: Record<string, { prompt: string; size: string }> = {
  pixar: {
    prompt: 'Modern Pixar 3D style, vibrant colors, expressive characters, soft lighting, cinematic composition',
    size: '1344x768',
  },
  lineart: {
    prompt: 'Coloring book page for children, black and white line art, clean outlines, no shading, no color, simple composition',
    size: '1024x1024',
  },
  'lineart-adult': {
    prompt: 'Adult coloring book page, intricate detailed black and white line art, fine lines, sophisticated composition, professional quality, detailed patterns and textures, no shading, no color, suitable for adult coloring',
    size: '1024x1024',
  },
  watercolor: {
    prompt: 'Delicate watercolor illustration, soft pastel colors, dreamy atmosphere, artistic brush strokes',
    size: '1024x1024',
  },
  realistic: {
    prompt: 'Photorealistic style, dramatic lighting, high detail, professional composition',
    size: '1344x768',
  },
};

// ─── Job Progress Types ───────────────────────────────────────────────────────

export interface JobProgress {
  id: string;
  status: JobStatus;
  progressMessage: string;
  progressPercent: number;
  retryCount?: number;
  maxRetries?: number;
  leaseExpiresAt?: string | null;
  lastHeartbeatAt?: string | null;
  result?: Record<string, unknown>;
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface BookWithChapters {
  id: string;
  title: string;
  genre: string;
  targetAudience: TargetAudience;
  status: BookStatus;
  coverImageUrl: string | null;
  totalCreditsEstimated: number;
  totalCreditsCharged: number;
  chapters: {
    id: string;
    index: number;
    title: string;
    status: ChapterStatus;
    wordCount: number;
    illustrationUrl: string | null;
  }[];
  createdAt: string;
}

// ─── Generation Flavor Text ───────────────────────────────────────────────────
// Contextual flavor text for generation progress, based on genre

export const GENERATION_FLAVOR: Record<string, string[]> = {
  fiction: [
    'The characters are finding their voices...',
    'Plot threads are weaving together...',
    'The story is unfolding beautifully...',
    'Chapters are coming to life...',
  ],
  fantasy: [
    'Dragons are circling the tower...',
    'Ancient spells are being incanted...',
    'The realm is taking shape...',
    'Heroes are gathering for the quest...',
  ],
  'sci-fi': [
    'Starships are charting new courses...',
    'The quantum drive is spinning up...',
    'New worlds are forming from stardust...',
    'The AI is compiling its thoughts...',
  ],
  mystery: [
    'Clues are being carefully placed...',
    'The detective is following leads...',
    'Secrets are lurking in the shadows...',
    'The truth is slowly unraveling...',
  ],
  children: [
    'Rainbows are painting the sky...',
    'Friendly characters are saying hello...',
    'The adventure is just beginning...',
    'Magic is in the air...',
  ],
  coloring: [
    'Lines are being drawn with care...',
    'Patterns are taking shape...',
    'Clean outlines are appearing...',
    'The canvas is ready for color...',
    'Intricate details are emerging...',
    'Each page awaits your palette...',
  ],
  default: [
    'Words are flowing onto the page...',
    'The creative engine is humming...',
    'Inspiration is striking...',
    'The manuscript is growing...',
  ],
};

// ─── Kids Book Adventure Types ────────────────────────────────────────────────

export const KIDS_ADVENTURES = [
  { value: 'farm',      label: 'On the Farm',     emoji: '🐄' },
  { value: 'school',    label: 'At School',       emoji: '🏫' },
  { value: 'fair',      label: 'At the Fair',     emoji: '🎡' },
  { value: 'boat',      label: 'On a Boat',       emoji: '⛵' },
  { value: 'forest',    label: 'In the Forest',   emoji: '🌲' },
  { value: 'beach',     label: 'At the Beach',    emoji: '🏖️' },
  { value: 'space',     label: 'In Space',        emoji: '🚀' },
  { value: 'zoo',       label: 'At the Zoo',      emoji: '🦁' },
  { value: 'castle',    label: 'In a Castle',     emoji: '🏰' },
  { value: 'city',      label: 'In the City',     emoji: '🌆' },
] as const;

export type KidsAdventure = typeof KIDS_ADVENTURES[number]['value'];

// ─── Audiobook Voices ─────────────────────────────────────────────────────────

export const AUDIOBOOK_VOICES = [
  { id: 'en-US-Neural2-C', label: 'Aurora',   gender: 'female' as const, style: 'Warm & Storytelling' },
  { id: 'en-US-Neural2-E', label: 'Sage',     gender: 'female' as const, style: 'Clear & Professional' },
  { id: 'en-US-Neural2-F', label: 'Luna',     gender: 'female' as const, style: 'Soft & Gentle' },
  { id: 'en-GB-Neural2-A', label: 'Iris',     gender: 'female' as const, style: 'British & Sophisticated' },
  { id: 'en-AU-Neural2-A', label: 'Skye',     gender: 'female' as const, style: 'Australian & Lively' },
  { id: 'en-US-Neural2-D', label: 'Atlas',    gender: 'male'   as const, style: 'Deep & Authoritative' },
  { id: 'en-US-Neural2-J', label: 'River',    gender: 'male'   as const, style: 'Casual & Warm' },
  { id: 'en-US-Neural2-A', label: 'Orion',    gender: 'male'   as const, style: 'Clear & Dynamic' },
  { id: 'en-GB-Neural2-B', label: 'Alistair', gender: 'male'   as const, style: 'British & Classic' },
  { id: 'en-AU-Neural2-B', label: 'Hunter',   gender: 'male'   as const, style: 'Australian & Bold' },
] as const;

// ─── Tier Pricing ─────────────────────────────────────────────────────────────

export const TIER_CONFIG: Record<Tier, { credits: number; price: number; label: string }> = {
  starter: { credits: 100, price: 0, label: 'Starter (Free Trial)' },
  author: { credits: 1000, price: 14.99, label: 'Author Studio' },
  publisher: { credits: 5000, price: 39.99, label: 'Publisher Pro' },
  studio: { credits: 20000, price: 99.99, label: 'Studio Enterprise' },
};
