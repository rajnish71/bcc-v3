import { IMAGES } from './images';
import type { JournalArticle } from '../../types/journal';

export const JOURNAL: JournalArticle[] = [
  {
    id: 'jr_01',
    slug: 'annual-exhibition-2026-report',
    isSeedData: true,
    title: 'Annual Exhibition 2026: A Celebration of Light and Stories',
    excerpt: 'A comprehensive review of the BCC Annual Exhibition at Bharat Bhavan, showcasing over 150 curated prints from members.',
    author: 'Rajnish Khare',
    publishedDate: '2026-07-05',
    coverImage: IMAGES.JOURNAL_EXHIBITION,
    readingTime: '5 min read'
  },
  {
    id: 'jr_02',
    slug: 'mastering-long-exposures-upper-lake',
    isSeedData: true,
    title: 'Mastering Long Exposures at Upper Lake',
    excerpt: 'Learn the core techniques for using ND filters, manual focus, and exposure calculation to shoot serene water textures.',
    author: 'Dr. Anil Bhati',
    publishedDate: '2026-07-10',
    coverImage: IMAGES.JOURNAL_TECHNIQUE,
    readingTime: '8 min read'
  },
  {
    id: 'jr_03',
    slug: 'chasing-monsoons-in-satpura',
    isSeedData: true,
    title: 'Chasing Monsoons in Satpura: A Landscape Journey',
    excerpt: 'An editorial travelogue detailing the challenges and beauty of documenting wilderness habitats during heavy rains.',
    author: 'Kshitij Patle',
    publishedDate: '2026-07-12',
    coverImage: IMAGES.JOURNAL_TRAVEL,
    readingTime: '12 min read'
  },
  {
    id: 'jr_04',
    slug: 'member-spotlight-veteran-wildlife-archivist',
    isSeedData: true,
    title: 'Member Spotlight: Documenting Decades of Birdlife',
    excerpt: 'An intimate conversation with one of our founding members about the transformation of Bhopal\'s wetland habitats.',
    author: 'Sauvik Acharyya',
    publishedDate: '2026-07-14',
    coverImage: IMAGES.JOURNAL_SPOTLIGHT,
    readingTime: '6 min read'
  },
  {
    id: 'jr_05',
    slug: 'behind-the-lens-elusive-paradise-flycatcher',
    isSeedData: true,
    title: 'Behind the Lens: The Elusive Paradise Flycatcher',
    excerpt: 'The patient story of waiting five hours in a hidden hide at Van Vihar to capture the state bird of Madhya Pradesh in mid-flight.',
    author: 'Yogesh More',
    publishedDate: '2026-07-16',
    coverImage: IMAGES.JOURNAL_BEHIND_PHOTO,
    readingTime: '4 min read'
  }
];
