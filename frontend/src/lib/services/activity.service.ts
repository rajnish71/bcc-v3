import { BUILD_API_URL } from '../api';
import type { Activity } from '../../types/activity';

/**
 * Activity service -- live data from the Activity API (GET /api/v1/events).
 * Build-time fetch (CLAUDE.md 4.5); if the backend is unreachable the lists
 * are empty rather than falling back to seed data.
 */

interface ApiActivity {
  id: number;
  slug: string;
  title: string;
  event_type: string;
  starts_at: string | null;
  ends_at: string | null;
  location_name: string | null;
  banner_url: string | null;
  fee_type: string;
  eligibility_mode: string;
  difficulty_level?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  PHOTOWALK: 'Photowalk',
  BIRD_WALK: 'Birding',
  WORKSHOP: 'Workshop',
  SEMINAR: 'Workshop',
  TRAINING: 'Workshop',
  TOUR: 'Expedition',
  EXHIBITION_EVENT: 'Exhibition',
  MEETUP: 'Meetup',
};

function durationLabel(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt || !endsAt) return '';
  const hours = (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3_600_000;
  if (!(hours > 0)) return '';
  if (hours < 24) return `${Math.round(hours * 10) / 10} hours`;
  return `${Math.ceil(hours / 24)} days`;
}

function toActivity(a: ApiActivity): Activity {
  return {
    id: String(a.id),
    slug: a.slug,
    isSeedData: false,
    title: a.title,
    summary: '',
    venue: a.location_name ?? '',
    city: 'Bhopal',
    startDate: a.starts_at ?? '',
    duration: durationLabel(a.starts_at, a.ends_at),
    coverImage: a.banner_url ?? '',
    category: CATEGORY_LABEL[a.event_type] ?? 'Activity',
    difficulty: a.difficulty_level === 'ADVANCED' ? 'Hard' : a.difficulty_level === 'INTERMEDIATE' ? 'Medium' : 'Easy',
    visibility: a.eligibility_mode === 'OPEN' ? 'Public' : 'Members Only',
    registrationRequired: true,
    isFree: a.fee_type === 'FREE',
  };
}

async function fetchScope(scope: 'upcoming' | 'past', limit = 100): Promise<Activity[]> {
  try {
    const res = await fetch(`${BUILD_API_URL}/events?scope=${scope}&limit=${limit}`);
    if (!res.ok) return [];
    const json = await res.json();
    const items: ApiActivity[] = Array.isArray(json.items) ? json.items : [];
    return items.map(toActivity);
  } catch {
    return [];
  }
}

/** Upcoming published Activities, soonest first. */
export async function getUpcomingActivities(): Promise<Activity[]> {
  return fetchScope('upcoming');
}

/** Past Activities (including historical records), newest first. */
export async function getPastActivities(): Promise<Activity[]> {
  return fetchScope('past');
}

/**
 * Featured (editorial) Activities: the live Activity model has no featured
 * flag, so none are featured; the homepage's conditional section stays hidden.
 */
export async function getFeaturedActivities(): Promise<Activity[]> {
  return [];
}

/** Photowalk-classified upcoming Activities. */
export async function getPhotowalks(): Promise<Activity[]> {
  return (await fetchScope('upcoming')).filter(a => a.category === 'Photowalk');
}
