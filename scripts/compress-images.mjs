// Compress public/*.jpg in place (max 1920px wide, quality 82). Usage:
//   npm i --no-save sharp && node scripts/compress-images.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const sharp = (await import('sharp')).default
const files = (await readdir('public')).filter((f) => /\.jpe?g$/i.test(f)).sort()
let before = 0, after = 0, n = 0
for (const f of files) {
  const buf = await readFile(join('public', f))
  before += buf.length
  if (buf.length < 300 * 1024) { after += buf.length; console.log('  skip', f); continue }
  const out = await sharp(buf).rotate()
    .resize({ width: 1920, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true, progressive: true }).toBuffer()
  if (out.length < buf.length) {
    await writeFile(join('public', f), out); n++; after += out.length
    console.log('  done', f, (buf.length / 1048576).toFixed(1) + 'MB ->', (out.length / 1024).toFixed(0) + 'KB')
  } else { after += buf.length; console.log('  skip', f) }
}
console.log(`\n${n}/${files.length} compressed: ${(before / 1048576).toFixed(1)}MB -> ${(after / 1048576).toFixed(1)}MB`)
