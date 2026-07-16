import { IMAGES } from './images';
import type { Contest } from '../../types/contest';

export const CONTESTS: Contest[] = [
  {
    id: 'ct_01',
    slug: 'monsoon-magic-2026',
    isSeedData: true,
    theme: 'Monsoon Magic',
    deadline: '2026-08-15',
    resultDate: '2026-08-25',
    status: 'Open',
    coverImage: IMAGES.CONTEST_MONSOON
  },
  {
    id: 'ct_02',
    slug: 'faces-of-bhopal',
    isSeedData: true,
    theme: 'Faces of Bhopal',
    deadline: '2026-07-20',
    resultDate: '2026-07-30',
    status: 'Judging',
    coverImage: IMAGES.CONTEST_FACES
  },
  {
    id: 'ct_03',
    slug: 'birds-of-central-india',
    isSeedData: true,
    theme: 'Birds of Central India',
    deadline: '2026-09-10',
    resultDate: '2026-09-20',
    status: 'Coming Soon',
    coverImage: IMAGES.CONTEST_BIRDS
  },
  {
    id: 'ct_04',
    slug: 'architecture-week',
    isSeedData: true,
    theme: 'Architecture Week',
    deadline: '2026-06-30',
    resultDate: '2026-07-10',
    status: 'Closed',
    coverImage: IMAGES.CONTEST_ARCHITECTURE
  },
  {
    id: 'ct_05',
    slug: 'street-stories-bhopal',
    isSeedData: true,
    theme: 'Street Stories',
    deadline: '2026-08-31',
    resultDate: '2026-09-10',
    status: 'Open',
    coverImage: IMAGES.CONTEST_STREET
  }
];
