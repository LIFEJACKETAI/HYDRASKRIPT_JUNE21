import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { db } from './src/lib/db';
import { jobQueue } from './src/lib/workers/queue';
import { runEditorialReview } from './src/lib/services/editorialReview';

const OWNER_ID = 'ef8077c4-31cd-4430-b4a3-30a297b46100';

const manuscript = `CHAPTER ONE: The Library
Mara Chen stepped out of the rain and into the old branch library on Harbor Street. She was twenty-nine, a restoration architect, with sharp green eyes that everyone mentioned first. The night before, the worst storm in a decade had torn through the town. Mara found an old brass key taped inside a copy of Moby-Dick on the third shelf. She slipped it into her coat pocket and forgot about it.

CHAPTER TWO: The Morning After
Three days after the storm, Mara met her brother Leo at the diner. "Did you find anything strange in the library?" Leo asked. "Only this," Mara said, holding up the brass key. Leo's eyes went wide. "That's the key to the lighthouse," he whispered. "The one that's been locked since the caretaker vanished." Mara felt the cold weight of the key in her pocket. She had never been to a lighthouse in her life, yet somehow she knew its grinding iron door.

CHAPTER THREE: The Lighthouse
A week after the storm, Mara Chan stood at the base of the lighthouse. She wore a bright blue raincoat. Her green eyes were fixed on the rusted door. "I found this key in the library," she told Leo, who had insisted on coming along. But when she reached into her coat pocket, the key was gone. It had been in her pocket all morning, she was sure of it. The key had simply vanished between the diner and the shore.

CHAPTER FOUR: The Locked Door
The door to the lighthouse was already open. Mara stepped inside and the door swung shut behind her with a boom like thunder. The storm, she thought, had not been a storm at all. It had come three days ago, or was it four? She could not remember. Outside, the sky was a hard, windless blue, and the sea was calm as glass.`;

async function main() {
  const review = await db.editorialReview.create({
    data: {
      ownerId: OWNER_ID,
      bookId: null,
      scope: 'manuscript',
      sourceLabel: 'SMOKE TEST — The Lighthouse',
      status: 'queued',
      sourceText: manuscript,
      textLength: manuscript.length,
    },
  });

  const jobId = await jobQueue.createJob({
    ownerId: OWNER_ID,
    jobType: 'editorial_review',
    creditsReserved: 0,
  });
  await db.editorialReview.update({ where: { id: review.id }, data: { jobId } });

  console.log(`[SMOKE] review=${review.id} job=${jobId} chars=${manuscript.length}`);
  await runEditorialReview(review.id);

  const done = await db.editorialReview.findUnique({
    where: { id: review.id },
    include: { findings: true },
  });
  console.log(`[SMOKE] status=${done?.status} findings=${done?.findings.length}`);
  for (const f of done?.findings ?? []) {
    console.log(`  [${f.severity}/${f.category}] ${f.title} @ ${f.location || 'n/a'}`);
    console.log(`     quote: ${f.quote.slice(0, 120)}`);
    console.log(`     desc:  ${f.description.slice(0, 160)}`);
  }

  await db.editorialReview.delete({ where: { id: review.id } });
  await db.job.delete({ where: { id: jobId } }).catch(() => {});
  console.log('[SMOKE] cleaned up');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[SMOKE] FAILED:', e);
    process.exit(1);
  });
