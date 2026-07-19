import { ikUrl } from '../lib/imagekit';

export interface PhotoRecord {
  id: string;
  src: string;      // local fallback path (public/images/…); master file, never modified
  r2Path?: string;  // R2-relative path (no leading slash, no domain); when set, delivery routes through ImageKit
  alt: string;
  photographer: string;
  caption: string;
  copyright: string;
  location?: string;
  year?: string;
  featured?: boolean;
  genres?: string[];
}

/**
 * Primary delivery URL for a photo.
 * Returns an ImageKit CDN URL when r2Path is set; falls back to the local src.
 * TODO: Populate r2Path for each archival entry after uploading masters to R2 (bccuploads bucket, suggested prefix: about/).
 */
export function photoSrc(record: PhotoRecord, width?: number): string {
  if (record.r2Path) {
    return ikUrl(record.r2Path, { w: width, q: 82, f: 'webp' });
  }
  return record.src;
}

/**
 * Responsive srcset string. Returns undefined when r2Path is not yet set (local delivery).
 */
export function photoSrcset(
  record: PhotoRecord,
  widths: number[] = [800, 1200, 1600, 2400],
): string | undefined {
  if (!record.r2Path) return undefined;
  return widths
    .map((w) => `${ikUrl(record.r2Path!, { w, q: 82, f: 'webp' })} ${w}w`)
    .join(', ');
}

/**
 * Composed photographer credit line for display in caption bars.
 * e.g. "Upper Lake arch bridge at sunset · Bhopal · Photo: Dr. Anil Bhati"
 */
export function photoCredit(record: PhotoRecord): string {
  return `${record.caption} · Photo: ${record.photographer}`;
}

/**
 * Centralized mapping of photographer names to their canonical profile usernames.
 */
export const photographerUsernames: Record<string, string> = {
  'Dr. Anil Bhati': 'anilbhati',
  'Dr Anil Bhati': 'anilbhati',
  'Kshitij Patle': 'kshitijpatle',
  'Kuldeep Lodhi': 'kuldeeplodhi',
  'Kuldeep': 'kuldeeplodhi',
};

/**
 * Gets the canonical profile URL for a photographer.
 */
export function getPhotographerProfileUrl(photographerName: string): string {
  const name = photographerName.trim();
  const username = photographerUsernames[name] || name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `/photographers/${username}/`;
}

// ---------------------------------------------------------------------------
// About page archival photograph registry
// All src values point to masters in public/images/ — originals are never modified.
// ---------------------------------------------------------------------------

export const aboutPhotos = {
  hero: {
    id: 'about-hero',
    src: '/images/Kuldeep Tajul Masajid Evening.jpg',
    // r2Path: 'about/kuldeep-tajul-masajid-evening.jpg',
    alt: 'Taj-ul-Masajid aerial view at evening — photograph by BCC member Kuldeep',
    photographer: 'Kuldeep Lodhi',
    caption: 'Taj-ul-Masajid at night · Bhopal',
    copyright: '© BCC Member Kuldeep',
    location: 'Taj-ul-Masajid, Bhopal',
    year: '2024',
    featured: true,
    genres: ['architecture', 'heritage', 'night'],
  },

  whyBhopalPrimary: {
    id: 'about-why-bhopal-primary',
    src: '/images/Anil Bhati2.jpg',
    // r2Path: 'about/anil-bhati-arch-bridge-chota-talab.jpg',
    alt: 'Arch Bridge on Chota Talab reflected at sunset — photograph by Dr. Anil Bhati',
    photographer: 'Dr. Anil Bhati',
    caption: 'Arch Bridge on Chota Talab · Bhopal',
    copyright: '© Dr. Anil Bhati',
    location: 'Chota Talab, Bhopal',
    featured: true,
    genres: ['landscape', 'water', 'golden-hour'],
  },

  whyBhopalSecondary: {
    id: 'about-why-bhopal-secondary',
    src: '/images/KSH_5803 (1).jpg.jpeg',
    // r2Path: 'about/ksh-5803-tajul-masajid-dusk.jpg',
    alt: 'Taj-ul-Masajid reflected in Chota Talab at dusk with birds in the foreground — photograph by Kshitij Patle',
    photographer: 'Kshitij Patle',
    caption: 'Taj-ul-Masajid · Chota Talab · Bhopal',
    copyright: '© Kshitij Patle',
    location: 'Chota Talab, Bhopal',
    genres: ['architecture', 'water', 'wildlife'],
  },

  communityPhotowalk: {
    id: 'about-community-photowalk',
    src: '/images/P1010146.jpg',
    // r2Path: 'about/p1010146-community-photowalk.jpg',
    alt: 'Bhopal Camera Club members on a photowalk — 2017–2018, photograph by Goutam Mitra',
    photographer: 'Goutam Mitra',
    caption: 'BCC community photowalk · 2017–2018',
    copyright: '© 2018 Goutam Mitra',
    year: '2017–2018',
    featured: true,
    genres: ['community', 'documentary'],
  },

  firstPhotowalk: {
    id: 'about-first-photowalk',
    src: '/images/FirstPhotoWalk-HeritageWalkat Tajul Masajid.jpeg',
    // r2Path: 'about/first-photowalk-heritage-walk-tajul-masajid.jpg',
    alt: 'First official BCC photowalk at Taj-ul-Masajid — 17 April 2016',
    photographer: 'BCC Member',
    caption: 'First BCC Photowalk · Taj-ul-Masajid · 17 April 2016',
    copyright: '© 2016 BCC',
    location: 'Taj-ul-Masajid, Bhopal',
    year: '2016',
    genres: ['documentary', 'heritage', 'community'],
  },

  groupPhotoManavSangralaya: {
    id: 'about-group-manav-sangralaya',
    src: '/images/GroupPhotoafteraPhotoWalkatManavSanghralaya2018.jpeg',
    // r2Path: 'about/group-photo-manav-sanghralaya-2018.jpg',
    alt: 'BCC community after a photowalk at Manav Sanghralaya — 2017–2018',
    photographer: 'Goutam Mitra',
    caption: 'BCC Photowalk · Manav Sanghralaya · 2018',
    copyright: '© 2018 Goutam Mitra',
    year: '2017–2018',
    genres: ['community', 'documentary'],
  },
} satisfies Record<string, PhotoRecord>;
