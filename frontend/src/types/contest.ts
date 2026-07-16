/**
 * Contest interface represents monthly or periodic club photography contests.
 */
export interface Contest {
  id: string;
  slug: string;
  isSeedData: boolean;
  theme: string;
  deadline: string; // ISO format YYYY-MM-DD
  resultDate: string; // ISO format YYYY-MM-DD
  status: 'Open' | 'Coming Soon' | 'Judging' | 'Closed';
  coverImage: string; // Local path
}
