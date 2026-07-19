// backend/src/modules/gallery/hero-destinations.config.ts

export interface HeroDestination {
  key: string;
  label: string;
  description: string;
  supportsFixed: boolean;
  supportsRotation: boolean;
}

export const HERO_DESTINATIONS: HeroDestination[] = [
  {
    key: 'home',
    label: 'Home',
    description: 'Main homepage landing hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'about',
    label: 'About',
    description: 'BCC Story & history page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'activities',
    label: 'Activities',
    description: 'Main activities landing page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'workshops',
    label: 'Workshops',
    description: 'Workshops listing page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'photowalks',
    label: 'Photowalks',
    description: 'Photowalks listing page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'contests',
    label: 'Contests',
    description: 'Contests listing page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'exhibitions',
    label: 'Exhibitions',
    description: 'Exhibitions listing page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'journal',
    label: 'Journal',
    description: 'BCC Journal / Blog landing hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'journal-articles',
    label: 'Journal Articles',
    description: 'Hero used by default on single journal post pages.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'membership',
    label: 'Membership',
    description: 'Join BCC page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'showcase',
    label: 'Showcase Landing',
    description: 'Member Showcase landing hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'projects',
    label: 'Projects Landing',
    description: 'Special Projects directory hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'birds-of-bhopal',
    label: 'Birds of Bhopal',
    description: 'Birds of Bhopal special project page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'butterflies-of-bhopal',
    label: 'Butterflies of Bhopal',
    description: 'Butterflies of Bhopal special project page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'heritage-of-bhopal',
    label: 'Heritage of Bhopal',
    description: 'Heritage Monuments of Bhopal special project page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'wildlife-of-bhopal',
    label: 'Wildlife of Bhopal',
    description: 'Wildlife of Bhopal special project page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'conduct',
    label: 'Code of Conduct',
    description: 'BCC Code of Conduct page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'contact',
    label: 'Contact',
    description: 'Contact us page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'copyright',
    label: 'Copyright & Licensing',
    description: 'BCC Copyright and Licensing policy hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'membership-rules',
    label: 'Membership Rules',
    description: 'Constitution & membership rules page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'partner-with-us',
    label: 'Partner With Us',
    description: 'BCC Sponsorship / Partnership page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'privacy',
    label: 'Privacy Policy',
    description: 'Platform privacy policy page hero.',
    supportsFixed: true,
    supportsRotation: true,
  },
  {
    key: 'terms',
    label: 'Terms of Use',
    description: 'Platform terms and conditions page hero.',
    supportsFixed: true,
    supportsRotation: true,
  }
];
