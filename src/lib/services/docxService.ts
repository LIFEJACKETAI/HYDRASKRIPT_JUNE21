// HydraSkript - DOCX Export Service
// Builds a valid Office Open XML (.docx) file from scratch (no external deps)
// DOCX is a ZIP containing XML files per the OOXML spec (ECMA-376)

import zlib from 'zlib';
import { saveFile, generateFilename, createMediaAsset } from '@/lib/utils/storage';
import { getBookWithChapters } from '@/lib/utils/bookHelpers';

// ─── Minimal ZIP builder (reuse same approach as EPUB service) ─────────────────

interface ZipEntry {
  name: string;
  data: Buffer;
  compress: boolean;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function buildZip(entries: ZipEntry[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const data = entry.compress ? zlib.deflateRawSync(entry.data, { level: 6 }) : entry.data;
    const crc = crc32(entry.data);
    const method = entry.compress ? 8 : 0;

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    localHeaders.push(local, data);
    centralDir.push(central);
    offset += local.length + data.length;
  }

  const centralDirBuffer = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, centralDirBuffer, eocd]);
}

// ─── XML helpers ──────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── DOCX XML Builders ────────────────────────────────────────────────────────

function buildContentTypes(): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`, 'utf8');
}

function buildRels(): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`, 'utf8');
}

function buildWordRels(): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`, 'utf8');
}

function buildCoreProps(book: any): Buffer {
  const now = new Date().toISOString();
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${esc(book.title)}</dc:title>
  <dc:creator>${esc(book.authorName || 'HydraSkript')}</dc:creator>
  <dc:description>${esc(book.synopsis || '')}</dc:description>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`, 'utf8');
}

function buildStyles(): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="480" w:after="160"/>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:sz w:val="40"/><w:szCs w:val="40"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:spacing w:before="240" w:after="120"/>
      <w:outlineLvl w:val="1"/>
    </w:pPr>
    <w:rPr>
      <w:b/><w:sz w:val="32"/><w:szCs w:val="32"/>
    </w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="BookTitle">
    <w:name w:val="Book Title"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="720" w:after="480"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr>
  </w:style>
</w:styles>`, 'utf8');
}

function buildSettings(): Buffer {
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:defaultTabStop w:val="709"/>
</w:settings>`, 'utf8');
}

function textToParagraphs(text: string): string {
  return (text || '')
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      // Each paragraph: normal style, justified, first-line indent
      const lines = p.split('\n').join(' ');
      return `  <w:p>
    <w:pPr>
      <w:pStyle w:val="Normal"/>
      <w:jc w:val="both"/>
      <w:ind w:firstLine="720"/>
    </w:pPr>
    <w:r><w:t xml:space="preserve">${esc(lines)}</w:t></w:r>
  </w:p>`;
    })
    .join('\n');
}

function buildDocument(book: any, chapters: any[]): Buffer {
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  // Title page
  const titlePage = `
  <w:p>
    <w:pPr><w:pStyle w:val="BookTitle"/></w:pPr>
    <w:r><w:t>${esc(book.title)}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="480"/></w:pPr>
    <w:r><w:rPr><w:i/><w:sz w:val="28"/></w:rPr><w:t>${esc(book.authorName || 'HydraSkript')}</w:t></w:r>
  </w:p>
  ${book.synopsis ? `<w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="720"/></w:pPr>
    <w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>${esc(book.synopsis)}</w:t></w:r>
  </w:p>` : ''}
  <w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

  // Chapters
  const chapterXml = chapters.map((ch, i) => {
    const chNum = i + 1;
    const heading = `
  <w:p>
    <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
    <w:r><w:t>Chapter ${chNum}: ${esc(ch.title || `Chapter ${chNum}`)}</w:t></w:r>
  </w:p>`;
    const body = textToParagraphs(ch.content);
    const pageBreak = i < chapters.length - 1
      ? '\n  <w:p><w:r><w:br w:type="page"/></w:r></w:p>'
      : '';
    return heading + '\n' + body + pageBreak;
  }).join('\n');

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
${titlePage}
${chapterXml}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
    </w:sectPr>
  </w:body>
</w:document>`, 'utf8');
}

// ─── Main Export Function ──────────────────────────────────────────────────────

export async function exportBookAsDOCX(
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
      { name: '[Content_Types].xml', data: buildContentTypes(), compress: true },
      { name: '_rels/.rels', data: buildRels(), compress: true },
      { name: 'word/_rels/document.xml.rels', data: buildWordRels(), compress: true },
      { name: 'docProps/core.xml', data: buildCoreProps(book), compress: true },
      { name: 'word/styles.xml', data: buildStyles(), compress: true },
      { name: 'word/settings.xml', data: buildSettings(), compress: true },
      { name: 'word/document.xml', data: buildDocument(book, chapters), compress: true },
    ];

    const docxBuffer = buildZip(entries);
    const filename = generateFilename(`book_${bookId}`, 'docx');
    const publicUrl = saveFile('exports', filename, docxBuffer);

    await createMediaAsset({
      ownerId,
      bookId,
      assetType: 'docx_export',
      storagePath: publicUrl,
      publicUrl,
      metadata: { format: 'docx', chapters: chapters.length },
    });

    return { success: true, publicUrl: `${publicUrl}?download=true` };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[DOCXService] Export failed:', msg);
    return { success: false, error: msg };
  }
}
