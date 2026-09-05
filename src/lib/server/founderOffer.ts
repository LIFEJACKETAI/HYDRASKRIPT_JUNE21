import { countFounderCommitments } from '@/lib/founder';

/** Safe for Server Components — never throws to the page. */
export async function loadFounderSoldCount(): Promise<number> {
  try {
    const { commitmentCount } = await countFounderCommitments();
    return commitmentCount;
  } catch (error) {
    console.error('[Founder] sold-count lookup failed:', error);
    return 0;
  }
}
