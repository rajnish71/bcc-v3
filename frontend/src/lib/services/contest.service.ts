import { CONTESTS } from '../../data/seed/contests';
import type { Contest } from '../../types/contest';

/**
 * Retrieves contests that are currently active or upcoming (Open or Coming Soon).
 */
export async function getOpenContests(): Promise<Contest[]> {
  return CONTESTS.filter(c => c.status === 'Open' || c.status === 'Coming Soon');
}
