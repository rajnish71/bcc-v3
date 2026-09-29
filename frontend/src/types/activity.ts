/**
 * Activity interface represents a club activity, heritage walk, or photowalk.
 */
export interface Activity {
  id: string;
  slug: string;
  isSeedData: boolean; // always false for records sourced from the live Activity API
  title: string;
  summary: string;
  venue: string;
  city: string;
  startDate: string; // ISO format; empty string when the exact date is unknown (historical)
  duration: string;  // e.g. "3 hours", "2 days"
  coverImage: string; // Path or key matching IMAGES constants
  category: string; // display label derived from the API event_type
  difficulty: 'Easy' | 'Medium' | 'Hard';
  visibility: 'Public' | 'Members Only';
  registrationRequired: boolean;
  isFree?: boolean; // fee_type === 'FREE' (live Activity API)
}
