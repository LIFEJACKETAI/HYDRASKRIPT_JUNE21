import 'dotenv/config';
import { db } from './src/lib/db';
const S = process.env.CRON_SECRET || '';
const BOOK_ID = '2f941912-1001-43ec-9fa2-a6aaf92ddc63';
async function status() {
  const job = await db.job.findFirst({ where: { bookId: BOOK_ID }, orderBy: { createdAt: 'asc' } });
  const book = await db.book.findUnique({ where: { id: BOOK_ID }, select: { status: true } });
  const chapters = await db.chapter.count({ where: { bookId: BOOK_ID } });
  return { bookStatus: book?.status, jobStatus: job?.status, retry: job?.retryCount, progress: job?.progressPercent, msg: job?.progressMessage, chapters };
}
async function main() {
  console.log('before:', JSON.stringify(await status()));
  for (let i = 0; i < 3; i++) {
    const res = await fetch('https://www.hydraskript.com/api/queue/pump', { method: 'POST', headers: { 'authorization': `Bearer ${S}`, 'cache-control': 'no-cache' } });
    console.log(`kick ${i}:`, res.status, (await res.text()).slice(0, 80));
  }
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const s = await status();
    console.log(`t+${(i+1)*15}s:`, JSON.stringify(s));
    if (s.jobStatus === 'completed' || s.jobStatus === 'failed' || s.bookStatus !== 'outlining') break;
  }
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
