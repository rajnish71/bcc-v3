/**
 * Activity interface represents a club activity, heritage walk, or photowalk.
 */
export interface Activity {
  id: string;
  slug: string;
  isSeedData: boolean;
  title: string;
  summary: string;
  venue: string;
  city: string;
  startDate: string; // ISO format (e.g. YYYY-MM-DD)
  duration: string;  // e.g. "3 hours", "2 days"
  coverImage: string; // Path or key matching IMAGES constants
  category: 'Heritage Walk' | 'Birding' | 'Landscape' | 'Street' | 'Nature' | 'Photowalk' | 'Expedition' | 'Documentation' | 'Workshop' | 'Exhibition' | 'Meetup';
  difficulty: 'Easy' | 'Medium' | 'Hard';
  visibility: 'Public' | 'Members Only';
  registrationRequired: boolean;
}
