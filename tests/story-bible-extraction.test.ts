// Unit tests for the story-bible extraction pipeline, focused on the
// book-level COVERAGE PASS that fills sections (Locations/Objects/Themes/
// History) the per-window model leaves empty — the root cause of the
// "import says success but sections are empty" bug.
import {
  extractEntitiesFromManuscript,
  buildManuscriptDigest,
  splitManuscriptWindows,
} from '@/lib/story-bible-extraction';

const llmCalls: { system: string; user: string }[] = [];
let windowHandler: (system: string, user: string) => unknown = () => ({ entities: [] });
let coverageHandler: (system: string, user: string) => unknown = () => ({ entities: [] });
let coverageShouldThrow = false;
let windowShouldThrow = false;

jest.mock('@/lib/llm/fallback', () => ({
  askLLMJSONWithFallback: async (system: string, user: string) => {
    llmCalls.push({ system, user });
    if (system.includes('still-missing kinds')) {
      if (coverageShouldThrow) throw new Error('coverage LLM down');
      return coverageHandler(system, user);
    }
    if (windowShouldThrow) throw new Error('window LLM down');
    return windowHandler(system, user);
  },
}));

const charactersOnly = () => ({
  entities: [
    { kind: 'CHARACTER', name: 'Mara Voss', role: 'Protagonist', summary: 'Detective.', motivation: 'Find her sister.', description: 'Tall and stubborn.', tags: ['tall'], secret: '' },
    { kind: 'CHARACTER', name: 'Corvin Hale', role: 'Antagonist', summary: 'Harbormaster.', motivation: 'Power.', description: 'Silver-tongued.', tags: ['ruthless'], secret: 'He faked his death in the Salt Wars.' },
  ],
});

const smallBook = (chars: number) => 'Word '.repeat(chars);

describe('buildManuscriptDigest', () => {
  test('returns short text unchanged', () => {
    const t = 'Hello, world. A short book.';
    expect(buildManuscriptDigest(t)).toBe(t);
  });

  test('long text stays under budget and keeps head + tail', () => {
    const marker = 'UNIQUE_TAIL_MARKER';
    const text = 'A'.repeat(100) + 'B'.repeat(120000) + marker;
    const digest = buildManuscriptDigest(text, 40000);
    expect(digest.length).toBeLessThanOrEqual(40000 + 600); // budget + marker overhead tolerance
    expect(digest.startsWith('A'.repeat(100))).toBe(true); // head kept
    expect(digest.endsWith(marker)).toBe(true); // tail kept
    expect(digest).toContain('omitted'); // middle elided
  });
});

describe('splitManuscriptWindows', () => {
  test('single window for short text', () => {
    expect(splitManuscriptWindows('hello world', 36000, 4000)).toEqual(['hello world']);
  });

  test('empty text yields no windows', () => {
    expect(splitManuscriptWindows('   \n  ', 36000, 4000)).toEqual([]);
  });

  test('covers the entire text with overlapping windows', () => {
    const text = 'x'.repeat(80000);
    const windows = splitManuscriptWindows(text, 36000, 4000);
    expect(windows.length).toBeGreaterThan(1);
    for (const w of windows) {
      expect(w.length).toBeLessThanOrEqual(36000);
    }
    // Consecutive windows overlap by exactly overlapChars
    expect(windows[1].slice(0, 4000)).toBe(windows[0].slice(-4000));
    // Last window reaches the very end of the text
    expect(windows[windows.length - 1]).toBe('x'.repeat(windows[windows.length - 1].length));
    expect(windows.reduce((s, w) => s + w.length, 0)).toBeGreaterThan(80000);
  });
});

describe('extractEntitiesFromManuscript — coverage pass', () => {
  beforeEach(() => {
    llmCalls.length = 0;
    windowHandler = charactersOnly;
    coverageHandler = () => ({
      entities: [
        { kind: 'LOCATION', name: 'New Carthage', role: 'Capital City', summary: 'Port city.', motivation: 'Main setting.', description: 'Rain and fog.', tags: ['city'], secret: '' },
        { kind: 'OBJECT', name: 'The Ledger of Hale', role: 'MacGuffin', summary: 'Book of debts.', motivation: 'Decides who is free.', description: 'Leather-bound.', tags: ['artifact'], secret: '' },
        { kind: 'THEME', name: 'Debt and Redemption', role: 'Central Theme', summary: 'What we owe.', motivation: 'Drives the conflict.', description: 'Favors and blood.', tags: ['debt'], secret: '' },
        { kind: 'HISTORY', name: 'The Salt Wars', role: 'Backstory Event', summary: 'Century-old war.', motivation: 'Explains tensions.', description: 'Fought over salt.', tags: ['war'], secret: '' },
      ],
    });
    coverageShouldThrow = false;
    windowShouldThrow = false;
  });

  test('fills ALL empty sections when windows only found characters', async () => {
    const result = await extractEntitiesFromManuscript(smallBook(50000));

    const kinds = new Set(result.entities.map((e) => e.kind));
    for (const kind of ['CHARACTER', 'LOCATION', 'OBJECT', 'THEME', 'HISTORY']) {
      expect(kinds.has(kind)).toBe(true);
    }
    expect(result.coverageFilled).toBe(4);

    // The coverage call was asked for exactly the missing kinds
    const coverageCall = llmCalls.find((c) => c.system.includes('still-missing kinds'));
    expect(coverageCall).toBeDefined();
    for (const kind of ['LOCATION', 'OBJECT', 'THEME', 'HISTORY']) {
      expect(coverageCall!.system).toContain(kind);
    }
    // And it was shown the roster of already-captured characters
    expect(coverageCall!.system).toContain('Mara Voss');
    // The digest used for the coverage call is bounded
    expect(coverageCall!.user.length).toBeLessThanOrEqual(41000);
  });

  test('does not call the coverage pass when every section already has content', async () => {
    windowHandler = () => ({
      entities: [
        { kind: 'CHARACTER', name: 'Mara', role: 'P', summary: 's', motivation: 'm', description: 'd', tags: [], secret: '' },
        { kind: 'LOCATION', name: 'New Carthage', role: 'C', summary: 's', motivation: 'm', description: 'd', tags: [], secret: '' },
        { kind: 'OBJECT', name: 'Ledger', role: 'O', summary: 's', motivation: 'm', description: 'd', tags: [], secret: '' },
        { kind: 'THEME', name: 'Debt', role: 'T', summary: 's', motivation: 'm', description: 'd', tags: [], secret: '' },
        { kind: 'HISTORY', name: 'Salt Wars', role: 'H', summary: 's', motivation: 'm', description: 'd', tags: [], secret: '' },
      ],
    });
    const result = await extractEntitiesFromManuscript(smallBook(20000));
    expect(result.coverageFilled).toBe(0);
    expect(llmCalls.find((c) => c.system.includes('still-missing kinds'))).toBeUndefined();
  });

  test('coverage pass failures are non-fatal — windows result is still returned', async () => {
    coverageShouldThrow = true;
    const result = await extractEntitiesFromManuscript(smallBook(20000));
    expect(result.entities.length).toBe(2); // only the characters
    expect(result.warnings.some((w) => w.startsWith('Coverage pass'))).toBe(true);
    expect(result.coverageFilled).toBe(0);
  });

  test('coverage output is filtered to only the missing kinds', async () => {
    // The model misbehaves and returns a CHARACTER again
    coverageHandler = () => ({
      entities: [
        { kind: 'CHARACTER', name: 'Ilya Voss', role: 'Sister', summary: 's', motivation: 'm', description: 'd', tags: [], secret: '' },
        { kind: 'THEME', name: 'Debt and Redemption', role: 'Theme', summary: 's', motivation: 'm', description: 'd', tags: [], secret: '' },
      ],
    });
    const result = await extractEntitiesFromManuscript(smallBook(20000));
    const names = result.entities.map((e) => e.name);
    expect(names).toContain('Debt and Redemption');
    expect(names).not.toContain('Ilya Voss');
    expect(result.coverageFilled).toBe(1);
  });

  test('all windows AND coverage fail → throws the first window error', async () => {
    windowShouldThrow = true;
    coverageShouldThrow = true;
    await expect(extractEntitiesFromManuscript(smallBook(20000))).rejects.toThrow('window LLM down');
  });

  test('merges the same entity across windows and keeps the richest fields', async () => {
    // Two windows (force >1 window with 40k text at window 36k/overlap 4k)
    windowHandler = (_system, user) => {
      const isSecond = /This is portion 2 of/.test(user);
      return {
        entities: [
          {
            kind: 'CHARACTER',
            name: 'Mara Voss',
            role: 'Protagonist',
            summary: 'Detective.',
            motivation: isSecond ? 'Find her sister and expose the harbor ring.' : 'Find her sister.',
            description: isSecond
              ? 'Tall, grey eyes, scarred brow. In the later chapters her coat is described as salt-stained and her left hand is missing two fingers.'
              : 'Tall, grey eyes, scarred brow.',
            tags: isSecond ? ['tall', 'scarred', 'missing-fingers'] : ['tall', 'scarred'],
            secret: isSecond ? 'She is the heir to the Salt Wars debt.' : '',
          },
        ],
      };
    };
    // all 5 kinds present in windows → no coverage call needed for merge test
    coverageHandler = () => ({ entities: [] });
    const result = await extractEntitiesFromManuscript(smallBook(42000));
    const mara = result.entities.find((e) => e.name === 'Mara Voss');
    expect(mara).toBeDefined();
    expect(result.entities.filter((e) => e.name === 'Mara Voss').length).toBe(1);
    expect(mara!.description).toContain('missing two fingers');
    expect(mara!.motivation).toContain('harbor ring');
    expect(mara!.secret).toContain('Salt Wars debt');
    expect(mara!.tags).toEqual(expect.arrayContaining(['tall', 'scarred', 'missing-fingers']));
  });
});
