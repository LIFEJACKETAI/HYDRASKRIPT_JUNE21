// HydraSkript - Professional Export Service
// Generates production-ready PDF exports of completed books
// Implements strict layout rules for Children's, Adult, and Coloring books

import PDFDocument from 'pdfkit';
import { db } from '@/lib/db';
import { saveFile, generateFilename, createMediaAsset } from '@/lib/utils/storage';
import { getBookWithChapters } from '@/lib/utils/bookHelpers';
import type { TargetAudience } from '@/types';
import axios from 'axios';

// ─── Layout Constants ──────────────────────────────────────────────────────────

const PAGE_WIDTH = 595.28;  // A4 Width in points
const PAGE_HEIGHT = 841.89; // A4 Height in points
const MARGIN = 50;

// ─── PDF Export ────────────────────────────────────────────────────────────────

/**
 * Generate a professional PDF for a completed book.
 * Satisfies the "Deploy Ready" requirement by producing a binary PDF.
 */
export async function exportBookAsPDF(
  bookId: string,
  ownerId: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  const book = await getBookWithChapters(bookId, ownerId);

  if (!book) return { success: false, error: 'Book not found' };
  if (book.status !== 'completed') {
    return { success: false, error: 'Book must be completed before exporting' };
  }

  try {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      autoFirstPage: false,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    const isChildrenBook = ['0-5', '6-9', '10-14'].includes(book.targetAudience);
    const isColoringBook = book.genre === 'coloring';

    // 1. Cover Page
    doc.addPage();
    if (book.coverImageUrl) {
      const imageBuffer = await fetchImageBuffer(book.coverImageUrl);
      if (imageBuffer) {
        doc.image(imageBuffer, 0, 0, { width: PAGE_WIDTH, height: PAGE_HEIGHT });
      }
    } else {
      doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill('#000');
      doc.fillColor('#fff').fontSize(30).text(book.title, 0, PAGE_HEIGHT / 2, { align: 'center' });
    }

    // 2. Chapters
    const chapters = book.chapters.sort((a, b) => a.index - b.index);

    for (const chapter of chapters) {
      doc.addPage();

      if (isColoringBook) {
        // COLORING BOOK: Full page image, no text
        if (chapter.illustrationUrl) {
          const img = await fetchImageBuffer(chapter.illustrationUrl);
          if (img) {
            doc.image(img, MARGIN, MARGIN, {
              width: PAGE_WIDTH - (MARGIN * 2),
              fit: [PAGE_WIDTH - (MARGIN * 2), PAGE_HEIGHT - (MARGIN * 2)]
            });
          }
        }
      } else if (isChildrenBook) {
        // CHILDREN'S BOOK: Top 50% Image, Bottom 50% Text
        if (chapter.illustrationUrl) {
          const img = await fetchImageBuffer(chapter.illustrationUrl);
          if (img) {
            doc.image(img, MARGIN, MARGIN, {
              width: PAGE_WIDTH - (MARGIN * 2),
              height: (PAGE_HEIGHT / 2) - MARGIN
            });
          }
        }

        doc.moveDown(10); // Move to bottom half
        doc.fillColor('#000').fontSize(18).text(chapter.title, { align: 'center' });
        doc.moveDown();
        doc.fontSize(14).text(chapter.content, { align: 'center', lineGap: 5 });
      } else {
        // ADULT BOOK: Standard professional layout
        doc.fillColor('#000').fontSize(22).text(`Chapter ${chapter.index + 1}: ${chapter.title}`, { align: 'left' });
        doc.moveDown();
        doc.fontSize(12).text(chapter.content, { align: 'justify', lineGap: 2 });
      }

      // Page Number
      doc.fontSize(10).fillColor('#999').text(
        `Page ${chapters.indexOf(chapter) + 1}`,
        PAGE_WIDTH / 2,
        PAGE_HEIGHT - 30,
        { align: 'center' }
      );
    }

    doc.end();

    // Wait for doc to finish generating
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);
    });

    // Save to storage
    const filename = generateFilename(`book_${bookId}`, 'pdf');
    const publicUrl = await saveFile('pdfs', filename, pdfBuffer, {
      contentType: 'application/pdf',
    });

    await createMediaAsset({
      ownerId,
      bookId,
      assetType: 'pdf_export',
      storagePath: publicUrl,
      publicUrl,
      metadata: { format: 'pdf', pages: chapters.length + 1 },
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

/**
 * Helper to fetch an image URL and return a Buffer for PDFKit.
 */
async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  } catch (e) {
    console.error(`[ExportService] Failed to fetch image ${url}:`, e);
    return null;
  }
}

export async function exportBookAsHTML(bookId: string, ownerId: string) {
  // Now redirects to professional PDF export
  return exportBookAsPDF(bookId, ownerId);
}
