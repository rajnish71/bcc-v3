/**
 * Workshop interface represents educational and training classes.
 */
export interface Workshop {
  id: string;
  slug: string;
  isSeedData: boolean;
  title: string;
  instructor: string;
  duration: string; // e.g. "3 hours", "1 Day"
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  summary: string;
  coverImage: string; // Local path
}
