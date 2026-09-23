import { computeAudiobookTracker, estimateSecondsPerSegment } from '@/lib/audiobook-progress'

const t = (epochMs: number) => new Date(epochMs).toISOString()
const START = 1_700_000_000_000

function seg(overrides: Partial<{ chapterPosition: number; chunkPosition: number; title: string; updatedAt: string }> = {}) {
  return {
    segmentIndex: 0,
    chapterIndex: 0,
    chapterPosition: 0,
    chunkPosition: 0,
    title: 'Chapter 1',
    publicUrl: 'https://example.com/chunk.mp3',
    extension: 'mp3',
    mimeType: 'audio/mpeg',
    updatedAt: t(START),
    ...overrides,
  }
}

describe('computeAudiobookTracker', () => {
  test('report segment ratio, remaining percent, and current chapter', () => {
    const totalSegments = 10
    const segments = [
      seg({ chapterPosition: 0, chunkPosition: 0, title: 'Prologue', updatedAt: t(START) }),
      seg({ chapterPosition: 1, chunkPosition: 0, title: 'Chapter 1', updatedAt: t(START + 120000) }),
      seg({ chapterPosition: 1, chunkPosition: 1, title: 'Chapter 1', updatedAt: t(START + 240000) }),
      seg({ chapterPosition: 1, chunkPosition: 2, title: 'Chapter 1', updatedAt: t(START + 360000) }),
    ]
    const tracker = computeAudiobookTracker({
      status: 'active',
      progressPercent: 42,
      startedAt: new Date(START),
      audiobookProgress: { totalSegments, segments },
    })
    expect(tracker).not.toBeNull()
    expect(tracker!.segmentsDone).toBe(4)
    expect(tracker!.segmentsTotal).toBe(10)
    expect(tracker!.percentComplete).toBe(40)
    expect(tracker!.percentRemaining).toBe(60)
    expect(tracker!.remainingSegments).toBe(6)
    expect(tracker!.currentChapterTitle).toBe('Chapter 1')
    expect(tracker!.currentChunk).toBe(3)
  })

  test('derives total from chapterPlan when totalSegments absent', () => {
    const tracker = computeAudiobookTracker({
      status: 'active',
      progressPercent: 10,
      startedAt: null,
      audiobookProgress: {
        chapterPlan: [
          { chapterPosition: 0, chapterIndex: 0, title: 'Prologue', chunkCount: 1 },
          { chapterPosition: 1, chapterIndex: 1, title: 'Chapter 1', chunkCount: 7 },
        ],
        segments: [seg({ chapterPosition: 0, chunkPosition: 0 })],
      },
    })
    expect(tracker!.segmentsTotal).toBe(8)
    expect(tracker!.percentComplete).toBe(13)
  })

  test('caps narration percent at 85 until completed', () => {
    const finished = computeAudiobookTracker({
      status: 'completed',
      progressPercent: 40,
      startedAt: null,
      audiobookProgress: { totalSegments: 5, segments: Array.from({ length: 5 }, seg) },
    })
    expect(finished!.percentComplete).toBe(100)
    expect(finished!.percentRemaining).toBe(0)

    const midRun = computeAudiobookTracker({
      status: 'active',
      progressPercent: 40,
      startedAt: null,
      audiobookProgress: { totalSegments: 5, segments: Array.from({ length: 5 }, seg) },
    })
    expect(midRun!.percentComplete).toBe(85)
  })

  test('falls back to progressPercent when no segment plan exists yet', () => {
    const tracker = computeAudiobookTracker({
      status: 'active',
      progressPercent: 22,
      startedAt: null,
      audiobookProgress: { segments: [] },
    })
    expect(tracker!.percentComplete).toBe(22)
    expect(tracker!.segmentsTotal).toBeNull()
    expect(tracker!.remainingSegments).toBeNull()
  })
})

describe('estimateSecondsPerSegment', () => {
  test('averages adjacent segment timings', () => {
    const segments = Array.from({ length: 5 }, (_, i) =>
      seg({ updatedAt: t(START + i * 100_000) })
    )
    expect(estimateSecondsPerSegment(segments)).toBe(100)
  })

  test('ignores a dead-claim gap so the ETA is not skewed', () => {
    const segments = [
      seg({ updatedAt: t(START) }),
      seg({ updatedAt: t(START + 150_000) }),
      seg({ updatedAt: t(START + 1_500_000) }), // 25-min freeze, then resumed claim
      seg({ updatedAt: t(START + 1_650_000) }),
      seg({ updatedAt: t(START + 1_800_000) }),
      seg({ updatedAt: t(START + 1_950_000) }),
    ]
    const rate = estimateSecondsPerSegment(segments)
    expect(rate).toBe(150)
  })

  test('returns null when there are too few timestamps', () => {
    expect(estimateSecondsPerSegment([seg()])).toBeNull()
    expect(estimateSecondsPerSegment([])).toBeNull()
  })
})