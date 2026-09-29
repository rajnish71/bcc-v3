// backend/src/modules/gallery/dto/update-photo.dto.ts
//
// PATCH /api/v1/gallery/photos/:uuid
// Owner can update content metadata and visibility after a photo is ACTIVE.
// EXIF is immutable after /confirm (reflects the actual capture metadata).

export interface UpdatePhotoDto {
  title?:               string;
  caption?:             string;
  description?:         string | null;
  exhibition_label?:    string | null;
  visibility?:          'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE' | 'UNLISTED';
  gps_stripped?:        boolean;
  /** When false, photo is excluded from the photographer portfolio listing only.
   *  Has no effect on visibility gating, Hero eligibility, or any admin tool. */
  show_in_portfolio?:   boolean;
  /** MEM-008: occupy (true) / release (false) one of the member's public
   *  portfolio slots. Rejected with 409 when a capped plan (Basic 5 /
   *  Student 10) has no free slot. Releasing never promotes another photo. */
  portfolio_selected?:  boolean;
  /** Link to (number) or unlink from (null) an Activity. Independent of
   *  show_in_portfolio. */
  source_event_id?:     number | null;
}
