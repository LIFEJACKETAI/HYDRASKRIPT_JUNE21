jest.mock('@/lib/db', () => ({ db: {} }))

import { splitManuscriptIntoChapters, truncateManuscript, wordCount } from '@/lib/manuscript'
import { publicJobResult } from '@/lib/job-public'
import { isBookExportable } from '@/lib/utils/bookHelpers'

describe('splitManuscriptIntoChapters', () => {
  test('returns a single chapter when there are no headings', () => {
    const parts = splitManuscriptIntoChapters('Once upon a time there was a harbor.')
    expect(parts).toEqual([{ title: 'Manuscript', content: 'Once upon a time there was a harbor.' }])
  })

  test('splits on Chapter headings and keeps a prologue', () => {
    const text = [
      'A long prologue that is definitely more than two hundred characters so we keep it as its own chapter when the first heading appears later in the file. Padding padding padding padding padding padding padding padding padding.',
      '',
      'Chapter 1 The Docks',
      'Mara stood in the fog.',
      '',
      'Chapter 2 The Ledger',
      'Hale opened the book.',
    ].join('\n')
    const parts = splitManuscriptIntoChapters(text)
    expect(parts[0].title).toBe('Prologue')
    expect(parts[1].title).toMatch(/Chapter 1/)
    expect(parts[1].content).toContain('Mara stood')
    expect(parts[2].title).toMatch(/Chapter 2/)
    expect(parts[2].content).toContain('Hale opened')
  })

  test('empty input yields no chapters', () => {
    expect(splitManuscriptIntoChapters('   \n  ')).toEqual([])
  })
})

describe('truncateManuscript / wordCount', () => {
  test('strips nuls and trims', () => {
    expect(truncateManuscript('  hello\u0000  ')).toBe('hello')
  })
  test('counts words', () => {
    expect(wordCount('one two  three')).toBe(3)
  })
})

describe('publicJobResult', () => {
  test('strips manuscript text so job polls stay small', () => {
    const raw = JSON.stringify({ fileName: 'book.txt', text: 'x'.repeat(5000), nextWindow: 2 })
    expect(publicJobResult(raw)).toEqual({
      fileName: 'book.txt',
      nextWindow: 2,
      textLength: 5000,
    })
  })

  test('passes through unrelated JSON', () => {
    expect(publicJobResult('{"autoApprove":true}')).toEqual({ autoApprove: true })
  })

  test('handles empty/invalid', () => {
    expect(publicJobResult(null)).toBeNull()
    expect(publicJobResult('not-json')).toBe('not-json')
  })
})

describe('isBookExportable', () => {
  test('allows books with chapter prose even if still draft', () => {
    expect(isBookExportable({ status: 'draft', chapters: [{ content: 'Hello' }] }).ok).toBe(true)
  })
  test('rejects empty drafts', () => {
    const result = isBookExportable({ status: 'draft', chapters: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/no chapter content/i)
  })
  test('allows completed books', () => {
    expect(isBookExportable({ status: 'completed', chapters: [] }).ok).toBe(true)
  })
})
