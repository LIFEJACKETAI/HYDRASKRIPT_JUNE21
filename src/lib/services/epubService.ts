// HydraSkript - EPUB Export Service
// Builds a valid EPUB 3.0 file from scratch (no external deps)
// EPUB spec: https://www.w3.org/TR/epub-33/

import fs from 'fs';
import path from 'path';
import { db } from '@/lib/db';
import { saveFile, generateFilename, createMediaAsset } from '@/lib/utils/storage';
import { getBookWithChapters } from '@/lib/utils/bookHelpers';

// ─── ZIP builder (EPUB is a ZIP file) ─────────────────────────────────────────
// We use a minimal ZIP implementation because Node has no built-in ZIP writer.
// Handles stored (uncompressed) and deflate-compressed entries.

import zlib from 'zlib';

interface ZipEntry {
  name: string;
  data: Buffer;
  compress: boolean;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const data = entry.compress
      ? zlib.deflateRawSync(entry.data, { level: 6 })
      : entry.data;

    const crc = crc32(entry.data);
    const method = entry.compress ? 8 : 0;

    // Local file header
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);      // signature
    local.writeUInt16LE(20, 4);               // version needed
    local.writeUInt16LE(0, 6);                // flags
    local.writeUInt16LE(method, 8);           // compression method
    local.writeUInt16LE(0, 10);               // mod time
    local.writeUInt16LE(0, 12);               // mod date
    local.writeUInt32LE(crc, 14);             // CRC-32
    local.writeUInt32LE(data.length, 18);     // compressed size
    local.writeUInt32LE(entry.data.length, 22); // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26); // file name length
    local.writeUInt16LE(0, 28);               // extra field length
    nameBytes.copy(local, 30);

    // Central directory header
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);     // signature
    central.writeUInt16LE(20, 4);              // version made by
    central.writeUInt16LE(20, 6);              // version needed
    central.writeUInt16LE(0, 8);               // flags
    central.writeUInt16LE(method, 10);         // compression method
    central.writeUInt16LE(0, 12);              // mod time
    central.writeUInt16LE(0, 14);              // mod date
    central.writeUInt32LE(crc, 16);            // CRC-32
    central.writeUInt32LE(data.length, 20);    // compressed size
    central.writeUInt32LE(entry.data.length, 24); // uncompressed size
    central.writeUInt16LE(nameBytes.length, 28); // file name length
    central.writeUInt16LE(0, 30);              // extra field length
    central.writeUInt16LE(0, 32);              // file comment length
    central.writeUInt16LE(0, 34);              // disk number start
    central.writeUInt16LE(0, 36);              // internal attributes
    central.writeUInt32LE(0, 38);              // external attributes
    central.writeUInt32LE(offset, 42);         // relative offset
    nameBytes.copy(central, 46);

    localHeaders.push(local, data);
    centralDir.push(central);
    offset += local.length + data.length;
  }

  const centralDirBuffer = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);           // signature
  eocd.writeUInt16LE(0, 4);                     // disk number
  eocd.writeUInt16LE(0, 6);                     // start disk
  eocd.writeUInt16LE(entries.length, 8);         // entries on disk
  eocd.writeUInt16LE(entries.length, 10);        // total entries
  eocd.writeUInt32LE(centralDirBuffer.length, 12); // central dir size
  eocd.writeUInt32LE(offset, 16);               // central dir offset
  eocd.writeUInt16LE(0, 20);                    // comment length

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

// CRC-32 lookup table
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ─── EPUB Content Builders ─────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildMimetype(): Buffer {
  return Buffer.from('application/epub+zip', 'utf8');
}

function buildContainer(): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`, 'utf8');
}

function buildOpf(book: any, chapterCount: number): Buffer {
  const now = new Date().toISOString().split('T')[0];
  const manifestItems = Array.from({ length: chapterCount }, (_, i) =>
    `    <item id="ch${i + 1}" href="chapter${i + 1}.xhtml" media-type="application/xhtml+xml"/>`
  ).join('\n');
  const spineItems = Array.from({ length: chapterCount }, (_, i) =>
    `    <itemref idref="ch${i + 1}"/>`
  ).join('\n');

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:${book.id}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator>${escapeXml(book.authorName || 'HydraSkript')}</dc:creator>
    <dc:language>${book.language || 'en'}</dc:language>
    <dc:date>${now}</dc:date>
    <dc:description>${escapeXml(book.synopsis || '')}</dc:description>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`, 'utf8');
}

function buildNcx(book: any, chapters: any[]): Buffer {
  const navPoints = chapters.map((ch, i) => `
    <navPoint id="ch${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(ch.title || `Chapter ${i + 1}`)}</text></navLabel>
      <content src="chapter${i + 1}.xhtml"/>
    </navPoint>`).join('');

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD ncx 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${book.id}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle><text>${escapeXml(book.title)}</text></docTitle>
  <navMap>${navPoints}
  </navMap>
</ncx>`, 'utf8');
}

function buildNav(chapters: any[]): Buffer {
  const items = chapters.map((ch, i) =>
    `      <li><a href="chapter${i + 1}.xhtml">${escapeXml(ch.title || `Chapter ${i + 1}`)}</a></li>`
  ).join('\n');

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>`, 'utf8');
}

function buildCSS(): Buffer {
  return Buffer.from(`body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1em;
  line-height: 1.6;
  margin: 1em 2em;
  color: #1a1a1a;
}
h1 { font-size: 1.8em; margin-bottom: 0.5em; }
h2 { font-size: 1.4em; margin-top: 1.5em; }
p { margin: 0.8em 0; text-indent: 1.5em; }
p:first-child { text-indent: 0; }
`, 'utf8');
}

function buildChapterXhtml(chapter: any, index: number): Buffer {
  // Split content into paragraphs
  const paragraphs = (chapter.content || '')
    .split(/\n\n+/)
    .map((p: string) => p.trim())
    .filter(Boolean)
    .map((p: string) => `  <p>${escapeXml(p)}</p>`)
    .join('\n');

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${escapeXml(chapter.title || `Chapter ${index + 1}`)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>${escapeXml(chapter.title || `Chapter ${index + 1}`)}</h1>
${paragraphs}
</body>
</html>`, 'utf8');
}

// ─── Main Export Function ──────────────────────────────────────────────────────

export async function exportBookAsEPUB(
  bookId: string,
  ownerId: string
): Promise<{ success: boolean; publicUrl?: string; error?: string }> {
  const book = await getBookWithChapters(bookId, ownerId);

  if (!book) return { success: false, error: 'Book not found' };
  if (book.status !== 'completed') {
    return { success: false, error: 'Book must be completed before exporting' };
  }

  try {
    const chapters = book.chapters.sort((a: any, b: any) => a.index - b.index);

    const entries: ZipEntry[] = [
      // mimetype MUST be first and MUST be uncompressed per EPUB spec
      { name: 'mimetype', data: buildMimetype(), compress: false },
      { name: 'META-INF/container.xml', data: buildContainer(), compress: true },
      { name: 'OEBPS/content.opf', data: buildOpf(book, chapters.length), compress: true },
      { name: 'OEBPS/toc.ncx', data: buildNcx(book, chapters), compress: true },
      { name: 'OEBPS/nav.xhtml', data: buildNav(chapters), compress: true },
      { name: 'OEBPS/styles.css', data: buildCSS(), compress: true },
      ...chapters.map((ch: any, i: number) => ({
        name: `OEBPS/chapter${i + 1}.xhtml`,
        data: buildChapterXhtml(ch, i),
        compress: true,
      })),
    ];

    const epubBuffer = buildZip(entries);
    const filename = generateFilename(`book_${bookId}`, 'epub');
    const publicUrl = await saveFile('exports', filename, epubBuffer, {
      contentType: 'application/epub+zip',
    });

    await createMediaAsset({
      ownerId,
      bookId,
      assetType: 'epub_export',
      storagePath: publicUrl,
      publicUrl,
      metadata: { format: 'epub', chapters: chapters.length },
    });

    return { success: true, publicUrl: `${publicUrl}?download=true` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[EPUBService] Export failed:', msg);
    return { success: false, error: msg };
  }
}
