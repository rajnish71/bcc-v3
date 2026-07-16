/**
 * images.ts — Centralized local asset path registry for seed development records.
 * Real production CMS images will swap out or override these paths.
 */

export const IMAGES = {
  // Activities
  ACTIVITY_HERITAGE: '/images/seed/activities/heritage.jpg',
  ACTIVITY_BIRDING: '/images/seed/activities/birding.jpg',
  ACTIVITY_LANDSCAPE: '/images/seed/activities/landscape.jpg',
  ACTIVITY_STREET: '/images/seed/activities/street.jpg',
  ACTIVITY_NATURE: '/images/seed/activities/nature.jpg',

  // Photowalks
  PHOTOWALK_TAJ_UL_MASAJID: '/images/seed/photowalks/taj-ul-masajid.jpg',
  PHOTOWALK_VAN_VIHAR: '/images/seed/photowalks/van-vihar.jpg',
  PHOTOWALK_SAIR_SAPATA: '/images/seed/photowalks/sair-sapata.jpg',
  PHOTOWALK_BHOJ_WETLAND: '/images/seed/photowalks/bhoj-wetland.jpg',
  PHOTOWALK_KALIYASOT: '/images/seed/photowalks/kaliyasot.jpg',

  // Workshops
  WORKSHOP_MANUAL_MODE: '/images/seed/workshops/manual-mode.jpg',
  WORKSHOP_COMPOSITION: '/images/seed/workshops/composition.jpg',
  WORKSHOP_BIRDING: '/images/seed/workshops/birding.jpg',
  WORKSHOP_EDITING: '/images/seed/workshops/editing.jpg',
  WORKSHOP_PORTRAIT: '/images/seed/workshops/portrait.jpg',

  // Contests
  CONTEST_MONSOON: '/images/seed/contests/monsoon.jpg',
  CONTEST_FACES: '/images/seed/contests/faces.jpg',
  CONTEST_BIRDS: '/images/seed/contests/birds.jpg',
  CONTEST_ARCHITECTURE: '/images/seed/contests/architecture.jpg',
  CONTEST_STREET: '/images/seed/contests/street.jpg',

  // Featured Activities
  FEATURED_EXPEDITION: '/images/seed/activities/featured-expedition.jpg',
  FEATURED_BUTTERFLY: '/images/seed/activities/featured-butterfly.jpg',
  FEATURED_CENSUS: '/images/seed/activities/featured-census.jpg',
  FEATURED_SUNRISE: '/images/seed/activities/featured-sunrise.jpg',
  FEATURED_NIGHT: '/images/seed/activities/featured-night.jpg',

  // Journal
  JOURNAL_EXHIBITION: '/images/seed/journal/exhibition.jpg',
  JOURNAL_TECHNIQUE: '/images/seed/journal/technique.jpg',
  JOURNAL_TRAVEL: '/images/seed/journal/travel.jpg',
  JOURNAL_SPOTLIGHT: '/images/seed/journal/spotlight.jpg',
  JOURNAL_BEHIND_PHOTO: '/images/seed/journal/behind-photo.jpg',

  // Photo Series
  SERIES_MONSOON: '/images/seed/photo-series/monsoon-reflections.jpg',
  SERIES_WINGS: '/images/seed/photo-series/wings-over-bhoj.jpg',
  SERIES_HERITAGE: '/images/seed/photo-series/heritage-in-stone.jpg',
  SERIES_LAKE_LIFE: '/images/seed/photo-series/lake-life.jpg',
  SERIES_MARKET: '/images/seed/photo-series/morning-markets.jpg'
} as const;
