// backend/src/modules/gallery/showcase-photo.predicate.ts
//
// Public Showcase eligibility -- the ONE predicate for "this canonical photo
// may appear on /showcase/". Shared by every Showcase read so the feed and
// its statistics can never drift apart:
//
//   GalleryService.getPublicFeed()        feed rows + full-archive total
//   GalleryService.countShowcasePhotos()  Photographers Directory
//                                         "Photos in Showcase" statistic
//
// A photo is Showcase-eligible when it is ACTIVE, PUBLIC, show_in_portfolio
// and exposed by the MEM-008 GALLERY exposure set (public_gallery_enabled,
// portfolio_max_photos cap, portfolio_selected, over-cap fail-closed --
// PortfolioExposureService / exposedPhotoPredicate). MEMBERS_ONLY, PRIVATE
// and UNLISTED photos are never Showcase-eligible.
//
// Per-photographer presentation (getPublicFeed's one-per-photographer mode)
// is a display choice applied AFTER this predicate; it is not eligibility.

import { exposedPhotoPredicate } from './portfolio-exposure.service';
import type { ExposureSet } from './portfolio-exposure.policy';

export const SHOWCASE_PHOTO_COLS = {
  owner:    'photos.owner_user_id',
  selected: 'photos.portfolio_selected',
  id:       'photos.id',
};

/**
 * Use inside `.where(eb => showcasePhotoPredicate(eb, set))` on a query over
 * `photos`. `set` must come from getExposureSet('GALLERY').
 */
export function showcasePhotoPredicate(eb: any, set: ExposureSet) {
  return eb.and([
    eb('photos.status', '=', 'ACTIVE'),
    eb('photos.visibility', '=', 'PUBLIC'),
    eb('photos.show_in_portfolio', '=', true as any),
    exposedPhotoPredicate(eb, SHOWCASE_PHOTO_COLS, set),
  ]);
}
