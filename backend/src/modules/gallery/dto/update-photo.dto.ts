// backend/src/modules/gallery/dto/update-photo.dto.ts
//
// PATCH /api/v1/gallery/photos/:uuid
// Owner can update content metadata and visibility after a photo is ACTIVE.
// EXIF is immutable after /confirm (reflects the actual capture metadata).

export interface UpdatePhotoDto {
  title?:      string;
  caption?:    string;
  genre?:
    | 'WILDLIFE' | 'BIRD' | 'STREET' | 'PORTRAIT' | 'LANDSCAPE'
    | 'ARCHITECTURE' | 'MACRO' | 'NIGHT' | 'TRAVEL' | 'AERIAL'
    | 'UNDERWATER' | 'ABSTRACT' | 'DOCUMENTARY' | 'SPORT'
    | 'BIRDS_OF_BHOPAL' | 'OTHER';
  visibility?: 'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE' | 'UNLISTED';
  gps_stripped?: boolean;
}
