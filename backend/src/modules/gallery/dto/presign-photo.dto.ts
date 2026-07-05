// backend/src/modules/gallery/dto/presign-photo.dto.ts
//
// Step 1 of the upload flow: client requests a presigned R2 PUT URL.
// Backend validates the declared file attributes and creates a PROCESSING
// photo record, then returns the URL.
//
// The presigned URL is valid for 15 minutes (defined in R2Service).
// The client must PUT the file with exactly the declared Content-Type and
// Content-Length or R2 will reject the upload.

export interface PresignPhotoDto {
  /** Original filename from the user's filesystem (e.g. "DSC_0042.jpg"). */
  filename: string;
  /** MIME type declared by the client. Validated against ALLOWED_MIME_TYPES. */
  mime_type: string;
  /** File size in bytes. Must be > 0 and <= MAX_PHOTO_BYTES (150 MB). */
  file_size_bytes: number;
  /** Optional: link this photo to an event. Must be a published event. */
  source_event_id?: number;
}
