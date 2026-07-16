import { WORKSHOPS } from '../../data/seed/workshops';
import type { Workshop } from '../../types/workshop';

/**
 * Retrieves educational club workshops.
 */
export async function getWorkshops(): Promise<Workshop[]> {
  return WORKSHOPS;
}
