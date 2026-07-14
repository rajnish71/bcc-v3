// backend/src/modules/gallery/dto/confirm-photo.dto.ts
//
// Step 3 of the upload flow: client notifies backend that R2 upload is done.
// Backend HEADs R2 to confirm the object exists, then transitions the photo
// to ACTIVE and stores any client-provided metadata.
//
// EXIF STRATEGY (Phase 2a):
//   All EXIF fields are optional and client-provided. The client should
//   extract EXIF from the file before/during upload using a browser EXIF
//   library (e.g. exifr). If EXIF is not provided, fields remain NULL.
//   Server-side EXIF extraction via R2 range read is deferred to Phase 4.
//
// SHA-256:
//   Client may compute SHA-256 via the Web Crypto API (SubtleCrypto.digest)
//   before or after upload. Used for exact-duplicate detection. Optional.

export interface ExifPayload {
  camera_make?:    string;
  camera_model?:   string;
  lens_model?:     string;
  focal_length?:   number;    // mm (decimal)
  aperture?:       number;    // f-number (e.g. 2.8)
  shutter_speed?:  string;    // e.g. "1/200" or "2"
  iso?:            number;
  taken_at?:       string;    // ISO 8601 datetime string from EXIF
  gps_lat?:        number;
  gps_lng?:        number;
  width_px?:       number;
  height_px?:      number;
}

export interface ConfirmPhotoDto {
  /** Optional title shown on the photo detail page and Members Wall. */
  title?: string;
  /** Optional caption / story behind the photo. */
  caption?: string;
  /** Genre classification (matches the genre ENUM on the photos table). */
  genre?:
    | 'WILDLIFE' | 'BIRD' | 'STREET' | 'PORTRAIT' | 'LANDSCAPE'
    | 'ARCHITECTURE' | 'MACRO' | 'NIGHT' | 'TRAVEL' | 'AERIAL'
    | 'UNDERWATER' | 'ABSTRACT' | 'DOCUMENTARY' | 'SPORT'
    | 'BIRDS_OF_BHOPAL' | 'OTHER';
  /** Visibility. Defaults to MEMBERS_ONLY if not provided. */
  visibility?: 'PUBLIC' | 'MEMBERS_ONLY' | 'PRIVATE' | 'UNLISTED';
  /** EXIF data extracted by the client. All fields optional. */
  exif?: ExifPayload;
  /** SHA-256 hex digest of the raw file bytes (Web Crypto). Optional. */
  sha256_hash?: string;
  /** Whether to strip GPS from public EXIF display. Defaults to false. */
  gps_stripped?: boolean;
}
