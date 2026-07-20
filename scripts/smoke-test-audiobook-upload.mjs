import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import PDFDocument from 'pdfkit';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const fixtureDir = path.join(process.cwd(), 'scripts', 'smoke-test-fixtures');

function splitManuscriptIntoChapters(text) {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const chapterRegex = /(^|\n)(chapter|part|section)\s+(\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b[^\n]*/gim;
  const matches = [...normalized.matchAll(chapterRegex)];

  if (matches.length >= 2) {
    return matches.map((match, index) => {
      const start = match.index ?? 0;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length;
      const chunk = normalized.slice(start, end).trim();
      const firstLine = chunk.split('\n')[0]?.trim() || `Chapter ${index + 1}`;

      return {
        id: `upload-${index}`,
        index,
        title: firstLine.slice(0, 120),
        content: chunk,
      };
    }).filter((chapter) => chapter.content.length > 0);
  }

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const targetCharsPerChapter = 12000;
  const chapters = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current && next.length > targetCharsPerChapter) {
      const chapterIndex = chapters.length;
      chapters.push({
        id: `upload-${chapterIndex}`,
        index: chapterIndex,
        title: `Part ${chapterIndex + 1}`,
        content: current,
      });
      current = paragraph;
    } else {
      current = next;
    }
  }

  if (current) {
    const chapterIndex = chapters.length;
    chapters.push({
      id: `upload-${chapterIndex}`,
      index: chapterIndex,
      title: chapters.length === 0 ? 'Manuscript' : `Part ${chapterIndex + 1}`,
      content: current,
    });
  }

  return chapters;
}

function buildZip(entries) {
  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    return table;
  })();

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  const localHeaders = [];
  const centralDir = [];
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

function escXml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function createTxtFixture(text) {
  const filePath = path.join(fixtureDir, 'sample-manuscript.txt');
  await fs.writeFile(filePath, text, 'utf8');
  return filePath;
}

async function createDocxFixture(text) {
  const paragraphs = text.split(/\n+/).filter(Boolean).map((line) => `
    <w:p><w:r><w:t xml:space="preserve">${escXml(line)}</w:t></w:r></w:p>`).join('');

  const entries = [
    {
      name: '[Content_Types].xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`, 'utf8'),
      compress: true,
    },
    {
      name: '_rels/.rels',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`, 'utf8'),
      compress: true,
    },
    {
      name: 'word/document.xml',
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${paragraphs}
    <w:sectPr/>
  </w:body>
</w:document>`, 'utf8'),
      compress: true,
    },
  ];

  const filePath = path.join(fixtureDir, 'sample-manuscript.docx');
  await fs.writeFile(filePath, buildZip(entries));
  return filePath;
}

async function createPdfFixture(text) {
  const filePath = path.join(fixtureDir, 'sample-manuscript.pdf');
  const doc = new PDFDocument({ margin: 50 });
  const stream = await fs.open(filePath, 'w');
  const writable = stream.createWriteStream();
  doc.pipe(writable);
  for (const line of text.split(/\n+/)) {
    doc.text(line || ' ');
    doc.moveDown(0.5);
  }
  doc.end();
  await new Promise((resolve, reject) => {
    writable.on('finish', resolve);
    writable.on('error', reject);
  });
  await stream.close();
  return filePath;
}

async function extractTextFromFile(filePath, extension) {
  if (extension === 'txt') {
    return fs.readFile(filePath, 'utf8');
  }

  const buffer = await fs.readFile(filePath);

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (extension === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  throw new Error(`Unsupported extension: ${extension}`);
}

async function smokeTestFile(filePath, extension) {
  const extracted = await extractTextFromFile(filePath, extension);
  const sanitized = extracted.replace(/\u0000/g, '').trim();
  const chapters = splitManuscriptIntoChapters(sanitized);

  console.log(`\n[${extension.toUpperCase()}] ${path.basename(filePath)}`);
  console.log(`Extracted chars: ${sanitized.length}`);
  console.log(`Detected chapters: ${chapters.length}`);
  console.log(`First chapter title: ${chapters[0]?.title ?? 'N/A'}`);

  if (!sanitized) {
    throw new Error(`${extension} extraction returned empty text`);
  }

  if (chapters.length < 2) {
    throw new Error(`${extension} chapter splitting did not detect multiple chapters`);
  }
}

async function main() {
  await fs.mkdir(fixtureDir, { recursive: true });

  const manuscript = `Chapter 1 The Signal\nThe first chapter begins with a mysterious signal arriving at dawn. The crew gathers around the console and argues about whether to respond.\n\nThey decide to investigate despite the risk.\n\nChapter 2 The Descent\nThe second chapter follows the team into the underground vault. Strange machinery hums in the dark and each room reveals new clues.\n\nBy the end, they understand the signal was meant for them.`;

  const txtPath = await createTxtFixture(manuscript);
  const docxPath = await createDocxFixture(manuscript);
  const pdfPath = await createPdfFixture(manuscript);

  await smokeTestFile(txtPath, 'txt');
  await smokeTestFile(docxPath, 'docx');
  await smokeTestFile(pdfPath, 'pdf');

  console.log('\nAudiobook upload parser smoke test passed for TXT, DOCX, and PDF fixtures.');
}

main().catch((error) => {
  console.error('\nSmoke test failed:', error);
  process.exitCode = 1;
});
