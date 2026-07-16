import { IMAGES } from './images';
import type { PhotoSeries } from '../../types/photoSeries';

export const PHOTO_SERIES: PhotoSeries[] = [
  {
    id: 'series_01',
    slug: 'monsoon-reflections',
    isSeedData: true,
    title: 'Monsoon Reflections',
    summary: 'A visual exploration of rain-slicked city streets, reflective puddles, and vibrant umbrellas across Bhopal.',
    coverImage: IMAGES.SERIES_MONSOON,
    photoCount: 12
  },
  {
    id: 'series_02',
    slug: 'wings-over-bhoj-wetland',
    isSeedData: true,
    title: 'Wings Over Bhoj Wetland',
    summary: 'An editorial series capturing migratory birds arriving at the Ramsar site during the winter nesting season.',
    coverImage: IMAGES.SERIES_WINGS,
    photoCount: 24
  },
  {
    id: 'series_03',
    slug: 'heritage-in-stone',
    isSeedData: true,
    title: 'Heritage in Stone',
    summary: 'A monochrome study of Islamic geometry, brick arches, and stone carvings in Bhopal\'s oldest structures.',
    coverImage: IMAGES.SERIES_HERITAGE,
    photoCount: 16
  },
  {
    id: 'series_04',
    slug: 'life-around-the-lake',
    isSeedData: true,
    title: 'Life Around the Lake',
    summary: 'Documenting the daily activities, quiet moments, and livelihoods centered on the Upper and Lower Lakes.',
    coverImage: IMAGES.SERIES_LAKE_LIFE,
    photoCount: 18
  },
  {
    id: 'series_05',
    slug: 'morning-markets-of-bhopal',
    isSeedData: true,
    title: 'Morning Markets of Bhopal',
    summary: 'Vibrant street visuals capturing the arrival of fresh produce, tea stalls, and early vendors in the old town.',
    coverImage: IMAGES.SERIES_MARKET,
    photoCount: 15
  }
];
