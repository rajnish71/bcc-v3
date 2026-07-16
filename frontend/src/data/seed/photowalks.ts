import { IMAGES } from './images';
import type { Activity } from '../../types/activity';

export const PHOTOWALKS: Activity[] = [
  {
    id: 'walk_01',
    slug: 'taj-ul-masajid-architectural-walk',
    isSeedData: true,
    title: 'Taj-ul-Masajid Architectural Walk',
    summary: 'Document the grand pink facade, massive minarets, and geometric stone columns of Asia\'s largest mosque.',
    venue: 'Taj-ul-Masajid Courtyard',
    city: 'Bhopal',
    startDate: '2026-06-15', // Past
    duration: '3 hours',
    coverImage: IMAGES.PHOTOWALK_TAJ_UL_MASAJID,
    category: 'Photowalk',
    difficulty: 'Easy',
    visibility: 'Public',
    registrationRequired: true
  },
  {
    id: 'walk_02',
    slug: 'van-vihar-national-park-trail',
    isSeedData: true,
    title: 'Van Vihar National Park Wilderness Trail',
    summary: 'A 5km lakeside walk focusing on capturing wildlife in open enclosures and wetland vistas.',
    venue: 'Van Vihar National Park Gate 2 (Lake Side)',
    city: 'Bhopal',
    startDate: '2026-06-22', // Past
    duration: '4 hours',
    coverImage: IMAGES.PHOTOWALK_VAN_VIHAR,
    category: 'Photowalk',
    difficulty: 'Medium',
    visibility: 'Public',
    registrationRequired: false
  },
  {
    id: 'walk_03',
    slug: 'sair-sapata-waterfront-sunset-walk',
    isSeedData: true,
    title: 'Sair Sapata Waterfront Sunset Walk',
    summary: 'Focus on golden hour silhouettes, suspension bridge symmetry, and reflections across the water.',
    venue: 'Sair Sapata Main Entrance',
    city: 'Bhopal',
    startDate: '2026-09-20', // Upcoming
    duration: '2.5 hours',
    coverImage: IMAGES.PHOTOWALK_SAIR_SAPATA,
    category: 'Photowalk',
    difficulty: 'Easy',
    visibility: 'Public',
    registrationRequired: false
  },
  {
    id: 'walk_04',
    slug: 'bhoj-wetland-morning-walk',
    isSeedData: true,
    title: 'Bhoj Wetland Morning Photography Walk',
    summary: 'Explore conservation paths and lake edges to photograph resident waterbirds and early morning mist.',
    venue: 'Bhoj Wetland Interpretation Centre',
    city: 'Bhopal',
    startDate: '2026-09-27', // Upcoming
    duration: '3.5 hours',
    coverImage: IMAGES.PHOTOWALK_BHOJ_WETLAND,
    category: 'Photowalk',
    difficulty: 'Easy',
    visibility: 'Members Only',
    registrationRequired: true
  },
  {
    id: 'walk_05',
    slug: 'kaliyasot-dam-landscape-walk',
    isSeedData: true,
    title: 'Kaliyasot Dam Landscape Walk',
    summary: 'Capture the vast spillway structures, rolling hills, and expansive reservoir during early hours.',
    venue: 'Kaliyasot Dam Viewpoint',
    city: 'Bhopal',
    startDate: '2026-10-04', // Upcoming
    duration: '3 hours',
    coverImage: IMAGES.PHOTOWALK_KALIYASOT,
    category: 'Photowalk',
    difficulty: 'Medium',
    visibility: 'Members Only',
    registrationRequired: true
  }
];
