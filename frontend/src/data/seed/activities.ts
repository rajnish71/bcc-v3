import { IMAGES } from './images';
import type { Activity } from '../../types/activity';

export const ACTIVITIES: Activity[] = [
  {
    id: 'act_01',
    slug: 'heritage-walk-old-bhopal',
    isSeedData: true,
    title: 'Heritage Walk — Old Bhopal',
    summary: 'Explore the narrow alleys, historic gateways, and Nawabi-era architecture of Bhopal\'s historic core.',
    venue: 'Chowk Bazaar (Starting Point)',
    city: 'Bhopal',
    startDate: '2026-06-02', // Past
    duration: '3 hours',
    coverImage: IMAGES.ACTIVITY_HERITAGE,
    category: 'Heritage Walk',
    difficulty: 'Easy',
    visibility: 'Public',
    registrationRequired: true
  },
  {
    id: 'act_02',
    slug: 'bird-photography-kerwa-dam',
    isSeedData: true,
    title: 'Bird Photography Morning — Kerwa Dam',
    summary: 'Capture resident raptors and wetland bird species in the golden morning light near Kerwa Dam.',
    venue: 'Kerwa Dam Reservoir Area',
    city: 'Bhopal',
    startDate: '2026-06-09', // Past
    duration: '4 hours',
    coverImage: IMAGES.ACTIVITY_BIRDING,
    category: 'Birding',
    difficulty: 'Medium',
    visibility: 'Public',
    registrationRequired: false
  },
  {
    id: 'act_03',
    slug: 'monsoon-landscape-upper-lake',
    isSeedData: true,
    title: 'Monsoon Landscape Session — Upper Lake',
    summary: 'A session dedicated to capturing dramatic monsoon clouds, vast water bodies, and scenic overlooks.',
    venue: 'VIP Road Viewpoint',
    city: 'Bhopal',
    startDate: '2026-08-16', // Upcoming
    duration: '2.5 hours',
    coverImage: IMAGES.ACTIVITY_LANDSCAPE,
    category: 'Landscape',
    difficulty: 'Easy',
    visibility: 'Members Only',
    registrationRequired: true
  },
  {
    id: 'act_04',
    slug: 'street-photography-meetup-chowk-bazaar',
    isSeedData: true,
    title: 'Street Photography Meetup — Chowk Bazaar',
    summary: 'Document the vibrant market culture, ancient havelis, and daily life of the old city.',
    venue: 'Kotwali Police Station',
    city: 'Bhopal',
    startDate: '2026-08-23', // Upcoming
    duration: '3 hours',
    coverImage: IMAGES.ACTIVITY_STREET,
    category: 'Street',
    difficulty: 'Medium',
    visibility: 'Public',
    registrationRequired: false
  },
  {
    id: 'act_05',
    slug: 'nature-photography-van-vihar',
    isSeedData: true,
    title: 'Nature Photography Morning — Van Vihar',
    summary: 'An early morning walk documenting wilderness, lakeside habitats, and wildlife patterns in the national park.',
    venue: 'Van Vihar Gate 1',
    city: 'Bhopal',
    startDate: '2026-08-30', // Upcoming
    duration: '4 hours',
    coverImage: IMAGES.ACTIVITY_NATURE,
    category: 'Nature',
    difficulty: 'Easy',
    visibility: 'Members Only',
    registrationRequired: true
  }
];
