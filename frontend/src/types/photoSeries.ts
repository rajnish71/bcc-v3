/**
 * PhotoSeries interface represents a curated photography collection or visual essay.
 */
export interface PhotoSeries {
  id: string;
  slug: string;
  isSeedData: boolean;
  title: string;
  summary: string;
  coverImage: string; // Local path
  photoCount: number;
}
