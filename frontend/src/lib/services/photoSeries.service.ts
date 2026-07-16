import { PHOTO_SERIES } from '../../data/seed/photoSeries';
import type { PhotoSeries } from '../../types/photoSeries';

/**
 * Retrieves featured photo series and visual essays.
 */
export async function getFeaturedPhotoSeries(): Promise<PhotoSeries[]> {
  return PHOTO_SERIES;
}
