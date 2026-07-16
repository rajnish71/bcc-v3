import { JOURNAL } from '../../data/seed/journal';
import type { JournalArticle } from '../../types/journal';

/**
 * Retrieves the latest journal articles and reports.
 */
export async function getLatestJournalArticles(): Promise<JournalArticle[]> {
  return JOURNAL;
}
