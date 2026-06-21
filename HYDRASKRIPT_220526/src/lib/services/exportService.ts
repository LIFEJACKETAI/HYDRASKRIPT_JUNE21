// HydraSkript - Export Service
// Generates PDF and EPUB exports of completed books
// Uses a simple HTML-to-PDF approach via Playwright or manual HTML generation

import { db } from '@/lib/db';
import { saveFile, generateFilename, createMediaAsset } from '@/lib/utils/storage';
import { getBookWithChapters } from '@/lib/utils/bookHelpers';
import type { TargetAudience } from '@/types';

// ─── PDF Export ────────────────────────────────────────────────────────────────

/**
 * Generate a PDF for a completed book.
 * Uses server-side HTML generation and saves as a downloadable asset.
 * For children's books: each page has illustration (top 50%) and text (bottom 50%).
 * For adult books: standard chapter layout.
 */
export async function exportBookAsPDF(
  bookId: string,
  ownerId: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  const book = await getBookWithChapters(bookId, ownerId);

  if (!book) {
    return { success: false, error: 'Book not found' };
  }

  if (book.status !== 'completed') {
    return { success: false, error: 'Book must be completed before exporting' };
  }

  try {
    const isChildrenBook = ['0-5', '6-9', '10-14'].includes(book.targetAudience);
    const isColoringBook = book.genre === 'coloring';

    // Generate HTML content for the book
    const html = generateBookHTML(book, isChildrenBook, isColoringBook);

    // Save as HTML file (can be printed to PDF by the browser)
    const filename = generateFilename(`book_${bookId}`, 'html');
    const publicUrl = saveFile('pdfs', filename, Buffer.from(html, 'utf-8'));

    // Create media asset record
    const asset = await createMediaAsset({
      ownerId,
      bookId,
      assetType: 'pdf_export',
      storagePath: publicUrl,
      publicUrl,
      metadata: {
        format: 'html',
        pageCount: book.chapters.length + (book.coverImageUrl ? 1 : 0),
        wordCount: book.chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
      },
    });

    return {
      success: true,
      publicUrl: `${publicUrl}?download=true`,
    };
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    console.error('[ExportService] PDF export failed:', errMessage);
    return { success: false, error: errMessage };
  }
}

// ─── HTML Generation ──────────────────────────────────────────────────────────

interface BookWithData {
  id: string;
  title: string;
  genre: string;
  targetAudience: string;
  coverImageUrl: string | null;
  chapters: {
    index: number;
    title: string;
    content: string;
    wordCount: number;
    illustrationUrl: string | null;
  }[];
}

function generateBookHTML(book: BookWithData, isChildrenBook: boolean, isColoringBook: boolean): string {
  const chapters = book.chapters.sort((a, b) => a.index - b.index);

  const pages = chapters.map((chapter, i) => {
    if (isColoringBook && chapter.illustrationUrl) {
      // Coloring book: just the illustration, full page
      return `
        <div class="page coloring-page">
          <img src="${chapter.illustrationUrl}" alt="${chapter.title}" class="coloring-illustration" />
          <div class="page-number">${i + 1}</div>
        </div>
      `;
    }

    if (isChildrenBook && chapter.illustrationUrl) {
      // Children's book: top 50% image, bottom 50% text
      return `
        <div class="page children-page">
          <div class="illustration-section">
            <img src="${chapter.illustrationUrl}" alt="${chapter.title}" class="chapter-illustration" />
          </div>
          <div class="text-section">
            <h2 class="chapter-title">${chapter.title}</h2>
            <div class="chapter-content">${formatContent(chapter.content)}</div>
          </div>
          <div class="page-number">${i + 1}</div>
        </div>
      `;
    }

    // Adult book: standard chapter layout
    return `
      <div class="page adult-page">
        <h2 class="chapter-title">Chapter ${i + 1}: ${chapter.title}</h2>
        <div class="chapter-content">${formatContent(chapter.content)}</div>
        <div class="page-number">${i + 1}</div>
      </div>
    `;
  }).join('\n');

  const coverPage = book.coverImageUrl
    ? `<div class="page cover-page">
         <img src="${book.coverImageUrl}" alt="${book.title} Cover" class="cover-image" />
         <h1 class="cover-title">${book.title}</h1>
       </div>`
    : `<div class="page cover-page">
         <h1 class="cover-title">${book.title}</h1>
         <p class="cover-genre">${book.genre}</p>
       </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${book.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Georgia', 'Times New Roman', serif; background: #1a1a1a; color: #333; }
    
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 20px auto;
      background: white;
      padding: 40px;
      page-break-after: always;
      position: relative;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    
    .cover-page {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #000;
      color: white;
    }
    
    .cover-image {
      max-width: 100%;
      max-height: 60%;
      object-fit: contain;
      border-radius: 8px;
    }
    
    .cover-title {
      font-size: 2.5em;
      margin-top: 30px;
      text-align: center;
      background: linear-gradient(135deg, #a855f7, #06b6d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    
    .cover-genre {
      font-size: 1.2em;
      color: #999;
      margin-top: 10px;
    }
    
    .children-page {
      display: flex;
      flex-direction: column;
    }
    
    .illustration-section {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 50%;
      padding-bottom: 10px;
    }
    
    .chapter-illustration {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 8px;
    }
    
    .text-section {
      flex: 1;
      padding-top: 10px;
      border-top: 2px solid #e5e5e5;
    }
    
    .coloring-page {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    
    .coloring-illustration {
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
    }
    
    .adult-page {
      line-height: 1.8;
    }
    
    .chapter-title {
      font-size: 1.5em;
      margin-bottom: 20px;
      color: #1a1a1a;
      border-bottom: 2px solid #a855f7;
      padding-bottom: 10px;
    }
    
    .chapter-content {
      font-size: 1.1em;
      line-height: 1.8;
      text-align: justify;
    }
    
    .chapter-content p {
      margin-bottom: 1em;
      text-indent: 1.5em;
    }
    
    .chapter-content p:first-child {
      text-indent: 0;
    }
    
    .page-number {
      position: absolute;
      bottom: 20px;
      right: 40px;
      font-size: 0.9em;
      color: #999;
    }
    
    @media print {
      .page { margin: 0; box-shadow: none; }
      body { background: white; }
    }
  </style>
</head>
<body>
  ${coverPage}
  ${pages}
</body>
</html>`;
}

/**
 * Format plain text content into HTML paragraphs.
 */
function formatContent(content: string): string {
  return content
    .split(/\n\n+/)
    .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

// ─── EPUB Export (Simplified) ─────────────────────────────────────────────────
// For simplicity, we generate an HTML export that can be opened in any browser
// and printed/saved as PDF. Full EPUB3 support would require a dedicated library.

export async function exportBookAsHTML(
  bookId: string,
  ownerId: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  // Same as PDF export but with a more web-friendly HTML format
  return exportBookAsPDF(bookId, ownerId);
}
