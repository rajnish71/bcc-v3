// backend/src/modules/gallery/dto/update-photo.dto.ts
//
// PATCH /api/v1/gallery/photos/:uuid
// Owner can update content metadata and visibility after a photo is ACTIVE.
// EXIF is immutable after /confirm (reflects the actual capture metadata).

export interface UpdatePhotoDto {
  title?:        string;
  caption?:      string;
  visibility?:   'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE' | 'UNLISTED';
  gps_stripped?: boolean;
}
