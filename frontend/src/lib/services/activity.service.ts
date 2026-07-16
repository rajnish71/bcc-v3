import { ACTIVITIES } from '../../data/seed/activities';
import { PHOTOWALKS } from '../../data/seed/photowalks';
import { FEATURED_ACTIVITIES } from '../../data/seed/featuredActivities';
import type { Activity } from '../../types/activity';

const ALL_ACTIVITIES = [...ACTIVITIES, ...PHOTOWALKS, ...FEATURED_ACTIVITIES];
const TODAY = '2026-07-16'; // Anchor date representing current local date context

/**
 * Retrieves upcoming club activities, sorted by date ascending.
 */
export async function getUpcomingActivities(): Promise<Activity[]> {
  return ALL_ACTIVITIES
    .filter(act => act.startDate >= TODAY)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Retrieves past club activities, sorted by date descending.
 */
export async function getPastActivities(): Promise<Activity[]> {
  return ALL_ACTIVITIES
    .filter(act => act.startDate < TODAY)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * Retrieves featured activities (editorial highlights) that are upcoming.
 */
export async function getFeaturedActivities(): Promise<Activity[]> {
  return FEATURED_ACTIVITIES
    .filter(act => act.startDate >= TODAY)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Retrieves photowalk activities.
 */
export async function getPhotowalks(): Promise<Activity[]> {
  return PHOTOWALKS;
}
