import { IMAGES } from './images';
import type { Workshop } from '../../types/workshop';

export const WORKSHOPS: Workshop[] = [
  {
    id: 'ws_01',
    slug: 'manual-mode-masterclass',
    isSeedData: true,
    title: 'Manual Mode Masterclass',
    instructor: 'Rajnish Khare',
    duration: '3 hours',
    level: 'Beginner',
    summary: 'Demystify ISO, aperture, and shutter speed. Gain full creative control over your exposure settings.',
    coverImage: IMAGES.WORKSHOP_MANUAL_MODE
  },
  {
    id: 'ws_02',
    slug: 'composition-beyond-rules',
    isSeedData: true,
    title: 'Composition Beyond Rules',
    instructor: 'Sauvik Acharyya',
    duration: '1 Day',
    level: 'Intermediate',
    summary: 'Explore advanced visual design, visual hierarchy, framing, and geometry to elevate your images.',
    coverImage: IMAGES.WORKSHOP_COMPOSITION
  },
  {
    id: 'ws_03',
    slug: 'bird-photography-essentials',
    isSeedData: true,
    title: 'Bird Photography Essentials',
    instructor: 'Yogesh More',
    duration: 'Half Day',
    level: 'Intermediate',
    summary: 'Learn key techniques for fieldcraft, tracking birds, focusing systems, and capturing flight shots.',
    coverImage: IMAGES.WORKSHOP_BIRDING
  },
  {
    id: 'ws_04',
    slug: 'lightroom-workflow-mastery',
    isSeedData: true,
    title: 'Lightroom Workflow Mastery',
    instructor: 'Dr. Anil Bhati',
    duration: '2 hours',
    level: 'Beginner',
    summary: 'A step-by-step guide to importing, organizing, color grading, and exporting your digital assets.',
    coverImage: IMAGES.WORKSHOP_EDITING
  },
  {
    id: 'ws_05',
    slug: 'portrait-lighting-fundamentals',
    isSeedData: true,
    title: 'Portrait Lighting Fundamentals',
    instructor: 'Rahil Khan',
    duration: '4 hours',
    level: 'Advanced',
    summary: 'Master off-camera flash, natural modifiers, and speedlight setups for studio and outdoor portraits.',
    coverImage: IMAGES.WORKSHOP_PORTRAIT
  }
];
