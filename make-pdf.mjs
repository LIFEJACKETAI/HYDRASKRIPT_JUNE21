import PDFDocument from 'pdfkit';
import fs from 'node:fs';
const doc = new PDFDocument();
doc.pipe(fs.createWriteStream('/tmp/opencode/real.pdf'));
doc.fontSize(14).text('Aris of Aetheria is the protagonist. The Iron Citadel is the capital. The Mana Eclipse happens in the Second Era. Lord Malakor is deceased.');
doc.end();
