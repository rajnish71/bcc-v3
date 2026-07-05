// backend/src/modules/shared/storage/imagekit.util.ts
//
// ImageKit URL construction helpers (TECH-STACK-FREEZE: ImageKit is the
// frozen CDN/transform layer). The ImageKit endpoint is configured via
// IMAGEKIT_URL_ENDPOINT in backend/.env. ImageKit is already pointed at the
// R2 bccuploads bucket as its origin -- no separate origin registration needed.
//
// All transforms use ImageKit's URL-based transform API. No server-side
// ImageKit SDK calls: URLs are constructed as strings and returned to clients
// directly. The client (Astro frontend) uses these URLs in <img> tags or
// CSS backgrounds. ImageKit serves cached/transformed variants from its CDN.
//
// Usage:
//   import { photoVariants, ikUrl } from '../shared/storage/imagekit.util';
//   const urls = photoVariants(photo.r2_key);
//   // { thumbnail, medium, large, original }

const IMAGEKIT_ENDPOINT =
  process.env.IMAGEKIT_URL_ENDPOINT ?? 'https://ik.imagekit.io/duynda7oq';

/**
 * Construct a single ImageKit URL for an R2 object key,
 * optionally with transform parameters.
 *
 * @param r2Key  - The R2 object key (e.g. "photos/7/2026/07/uuid.jpg")
 * @param tr     - ImageKit transform string (e.g. "w-800,c-maintain_ratio")
 *                 Pass undefined for the original (no transform).
 */
export function ikUrl(r2Key: string, tr?: string): string {
  const base = `${IMAGEKIT_ENDPOINT}/${r2Key}`;
  return tr ? `${base}?tr=${tr}` : base;
}

/**
 * Standard set of display variants for a member photo.
 *
 * Sizes follow spec 05.1:
 *   thumbnail       200px wide  -- grid cells, avatars
 *   medium          800px wide  -- gallery wall, card previews
 *   large           1600px wide -- detail view, lightbox
 *   original        No transform -- download, full resolution
 *
 * ImageKit maintains the original aspect ratio; no crops are applied.
 * c-maintain_ratio is the default behaviour but stated explicitly for
 * clarity.
 */
export function photoVariants(r2Key: string): {
  thumbnail: string;
  medium: string;
  large: string;
  original: string;
} {
  return {
    thumbnail: ikUrl(r2Key, 'w-200,c-maintain_ratio'),
    medium:    ikUrl(r2Key, 'w-800,c-maintain_ratio'),
    large:     ikUrl(r2Key, 'w-1600,c-maintain_ratio'),
    original:  ikUrl(r2Key),
  };
}

/**
 * Display variant with watermark overlay (spec 05.2: watermark policy).
 * Watermark applied to the large/display size only.
 *
 * The watermark image (bcc-watermark.png) must be uploaded to the ImageKit
 * media library. Position: bottom-right (N-10 offset from each edge).
 *
 * Phase 2a: watermark is applied to the display-watermarked variant only.
 * Phase 3+: per-photo and per-user download control will determine whether
 * watermark is stripped for original downloads.
 */
export function watermarkedDisplay(r2Key: string): string {
  return ikUrl(r2Key, 'w-1600,c-maintain_ratio,l-image,i-bcc-watermark.png,lfo-bottom_right,lx-N10,ly-N10,l-end');
}

/**
 * R2 object key for a member-uploaded photo.
 * Format: photos/{userId}/{year}/{month}/{uuid}.{ext}
 *
 * Using userId and date in the path gives a natural folder structure in the
 * R2 bucket and allows per-user listing via prefix scans if needed.
 */
export function photoR2Key(
  userId: number,
  uuid: string,
  ext: string,
): string {
  const now = new Date();
  const year  = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `photos/${userId}/${year}/${month}/${uuid}.${ext.toLowerCase()}`;
}

/**
 * Derive file extension from a MIME type or original filename.
 * Falls back to 'bin' if unknown.
 */
export function extFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg':          'jpg',
    'image/jpg':           'jpg',
    'image/png':           'png',
    'image/tiff':          'tiff',
    'image/heic':          'heic',
    'image/heif':          'heic',
    'image/webp':          'webp',
    'image/x-nikon-nef':   'nef',
    'image/x-canon-cr2':   'cr2',
    'image/x-canon-cr3':   'cr3',
    'image/x-sony-arw':    'arw',
    'image/x-olympus-orf': 'orf',
    'image/x-adobe-dng':   'dng',
  };
  return map[mimeType.toLowerCase()] ?? 'bin';
}

/**
 * Normalise a MIME type to the file_format ENUM used in the photos table.
 */
export type PhotoFileFormat =
  | 'JPEG' | 'PNG' | 'TIFF' | 'HEIC' | 'WEBP'
  | 'NEF'  | 'CR2' | 'CR3'  | 'ARW'  | 'ORF' | 'DNG' | 'OTHER';

export function mimeToFormat(mimeType: string): PhotoFileFormat {
  const map: Record<string, PhotoFileFormat> = {
    'image/jpeg':          'JPEG',
    'image/jpg':           'JPEG',
    'image/png':           'PNG',
    'image/tiff':          'TIFF',
    'image/heic':          'HEIC',
    'image/heif':          'HEIC',
    'image/webp':          'WEBP',
    'image/x-nikon-nef':   'NEF',
    'image/x-canon-cr2':   'CR2',
    'image/x-canon-cr3':   'CR3',
    'image/x-sony-arw':    'ARW',
    'image/x-olympus-orf': 'ORF',
    'image/x-adobe-dng':   'DNG',
  };
  return map[mimeType.toLowerCase()] ?? 'OTHER';
}

/** Maximum upload size per file (150 MB -- covers RAW formats). */
export const MAX_PHOTO_BYTES = 150 * 1024 * 1024;

/** Allowed MIME types for photo uploads. */
export const ALLOWED_MIME_TYPES = new Set<string>([
  'image/jpeg', 'image/jpg', 'image/png', 'image/tiff',
  'image/heic', 'image/heif', 'image/webp',
  'image/x-nikon-nef', 'image/x-canon-cr2', 'image/x-canon-cr3',
  'image/x-sony-arw', 'image/x-olympus-orf', 'image/x-adobe-dng',
]);
