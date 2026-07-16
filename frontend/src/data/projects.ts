/**
 * projects.ts — Static project registry for BCC Special Projects.
 * Data source for /projects/{slug} pages.
 * Contributors are editorially curated per project.
 */

export interface ProjectContributor {
  name: string;
  username: string;
  initials: string;
  bio: string;
  photoCount: number;
  avatar?: string;
}

export interface ProjectData {
  title: string;
  slug: string;
  description: string;
  about: string[];
  apiTag: string;
  subjectLabel: string;
  subjectCount: number;
  lastUpdated: string;
  heroImage?: string;
  contributors: ProjectContributor[];
  relatedSlugs: string[];
}

const BIRDS_CONTRIBUTORS: ProjectContributor[] = [
  {
    name: 'Yogesh More',
    username: 'yogiym',
    initials: 'YM',
    bio: 'Head of the Birds of Bhopal Project and BCC Bird Walk Chief Coordinator. One of Bhopal\'s finest field naturalists — he leads every bird walk with rigour, warmth, and a deep commitment to ethical birding practice.',
    photoCount: 420,
    avatar: 'https://ik.imagekit.io/duynda7oq/avatars/41/c6a9be4d-2d50-47d9-a4c6-2c0c88e8928b.jpg',
  },
  {
    name: 'Rajnish Khare',
    username: 'rajnishkhare',
    initials: 'RK',
    bio: 'Founder of Bhopal Camera Club and a wildlife and travel photographer. Rajnish has documented birds across Bhopal\'s lakes, forests, and wetlands — from the winter migrants of Upper Lake to the resident raptors of Van Vihar.',
    photoCount: 312,
    avatar: 'https://ik.imagekit.io/duynda7oq/avatars/1/51392d1b-bd2d-4e90-8358-1d7dc5bfeb56.jpg',
  },
  {
    name: 'Kshitij Patle',
    username: 'kshitijpatle',
    initials: 'KP',
    bio: 'Travel storyteller and wildlife enthusiast. Kshitij has contributed some of the finest bird portraits in the archive — his patience and field knowledge consistently yield extraordinary shots of elusive species.',
    photoCount: 198,
    avatar: 'https://ik.imagekit.io/duynda7oq/uploads/avatars/1781515190910-cb635096.jpg',
  },
  {
    name: 'Dr. Anil Bhati',
    username: 'anilbhati',
    initials: 'AB',
    bio: 'BCC Post Processing Mentor and a passionate landscape and wildlife photographer. Dr. Bhati\'s bird images combine exceptional technical quality with a deep understanding of habitat and behaviour.',
    photoCount: 154,
    avatar: 'https://ik.imagekit.io/duynda7oq/uploads/avatars/1781581626973-a9db8ce9.jpg',
  },
];

const BUTTERFLIES_CONTRIBUTORS: ProjectContributor[] = [
  {
    name: 'Rajnish Khare',
    username: 'rajnishkhare',
    initials: 'RK',
    bio: 'Founder of Bhopal Camera Club and an avid nature photographer. Rajnish has explored Bhopal\'s green corridors to document the remarkable butterfly diversity of the City of Lakes.',
    photoCount: 187,
    avatar: 'https://ik.imagekit.io/duynda7oq/avatars/1/51392d1b-bd2d-4e90-8358-1d7dc5bfeb56.jpg',
  },
  {
    name: 'Kshitij Patle',
    username: 'kshitijpatle',
    initials: 'KP',
    bio: 'Nature and travel photographer who brings extraordinary patience to macro work. Kshitij has captured some of the finest butterfly portraits in the archive — from common emigrants to the rarest seasonal visitors.',
    photoCount: 143,
    avatar: 'https://ik.imagekit.io/duynda7oq/uploads/avatars/1781515190910-cb635096.jpg',
  },
  {
    name: 'Yogesh More',
    username: 'yogiym',
    initials: 'YM',
    bio: 'Field naturalist and bird expert who brings the same discipline and rigour to butterfly documentation. Yogesh has contributed systematic species records that form the backbone of the archive.',
    photoCount: 98,
    avatar: 'https://ik.imagekit.io/duynda7oq/avatars/41/c6a9be4d-2d50-47d9-a4c6-2c0c88e8928b.jpg',
  },
  {
    name: 'Dr. Anil Bhati',
    username: 'anilbhati',
    initials: 'AB',
    bio: 'Post Processing Mentor and landscape photographer who discovered a passion for lepidopteran macro during BCC field sessions. His technically polished images bring out intricate wing-pattern details.',
    photoCount: 76,
    avatar: 'https://ik.imagekit.io/duynda7oq/uploads/avatars/1781581626973-a9db8ce9.jpg',
  },
];

const HERITAGE_CONTRIBUTORS: ProjectContributor[] = [
  {
    name: 'Rajnish Khare',
    username: 'rajnishkhare',
    initials: 'RK',
    bio: 'Founder of Bhopal Camera Club and the driving force behind Heritage Walks. Rajnish has led walks to some of Bhopal\'s most storied sites — from the old city\'s carved doorways to the grand monuments of the Nawabi era.',
    photoCount: 356,
    avatar: 'https://ik.imagekit.io/duynda7oq/avatars/1/51392d1b-bd2d-4e90-8358-1d7dc5bfeb56.jpg',
  },
  {
    name: 'Sauvik Acharyya',
    username: 'sauvikacharyya',
    initials: 'SA',
    bio: 'Street Photography Mentor and impromptu walk enthusiast. Sauvik brings the street photographer\'s eye to heritage documentation — reading light, shadow, people, and architecture in a single decisive frame.',
    photoCount: 241,
    avatar: 'https://ik.imagekit.io/duynda7oq/avatars/31/36bb7e58-8fc1-4bab-abac-152b5de535ae.jpg',
  },
  {
    name: 'Rahil Khan',
    username: 'rahilkhan',
    initials: 'RK',
    bio: 'Contemporary street visual artist and Core Coordinator. Rahil\'s dynamic frame compositions bring urban energy to BCC\'s heritage documentation — turning ancient corridors and bazaar lanes into vivid street portraits.',
    photoCount: 198,
    avatar: 'https://ik.imagekit.io/duynda7oq/uploads/avatars/1781874918562-8ae28b6c.jpg',
  },
  {
    name: 'Kshitij Patle',
    username: 'kshitijpatle',
    initials: 'KP',
    bio: 'Travel storyteller who brings a global traveller\'s sensitivity to Bhopal\'s local heritage. Kshitij excels at isolating the small, telling details — a carved jali, a fading fresco, a weathered door — that reveal layers of history.',
    photoCount: 167,
    avatar: 'https://ik.imagekit.io/duynda7oq/uploads/avatars/1781515190910-cb635096.jpg',
  },
];

export const PROJECTS: Record<string, ProjectData> = {
  'birds-of-bhopal': {
    title: 'Birds of Bhopal',
    slug: 'birds-of-bhopal',
    description: 'Exploring the avian diversity of the City of Lakes through the eyes of Bhopal Camera Club photographers.',
    about: [
      'This is an evolving visual archive documenting birds photographed by members of Bhopal Camera Club across the lakes, forests, parks, and wetlands of Bhopal. Every image here was captured by a club member and represents a real encounter with the remarkable birdlife that thrives in and around the City of Lakes — from the migratory visitors that arrive each winter to the year-round residents of Van Vihar, Upper Lake, and the surrounding greenery.',
      'Future versions of this archive will include species identification, scientific names, habitat information, migration data, and detailed bird profiles — turning each photograph into a richer record of Bhopal\'s natural heritage. For now, we invite you to explore the collection as it grows, photograph by photograph, through the lenses of our members.',
    ],
    apiTag: 'birds-of-bhopal',
    subjectLabel: 'Species Documented',
    subjectCount: 0,
    lastUpdated: 'Jul 2026',
    contributors: BIRDS_CONTRIBUTORS,
    relatedSlugs: ['butterflies-of-bhopal', 'heritage-monuments-of-bhopal'],
  },

  'butterflies-of-bhopal': {
    title: 'Butterflies of Bhopal',
    slug: 'butterflies-of-bhopal',
    description: 'Documenting the butterfly diversity of the City of Lakes through the eyes of Bhopal Camera Club photographers.',
    about: [
      'This is an evolving visual archive documenting butterflies photographed by members of Bhopal Camera Club across the gardens, forests, wetlands, and green corridors of Bhopal. Every image here was captured by a club member and represents a real encounter with the remarkable lepidopteran diversity that flourishes in and around the City of Lakes — from the common emigrants and jezebels that grace urban gardens to the rare seasonal visitors found deep in the surrounding forests.',
      'Future versions of this archive will include species identification, scientific names, habitat information, life cycle stages, host plant associations, seasonality data, and detailed identification guides — turning each photograph into a richer record of Bhopal\'s natural heritage. For now, we invite you to explore the collection as it grows, photograph by photograph, through the lenses of our members.',
    ],
    apiTag: 'butterflies-of-bhopal',
    subjectLabel: 'Species Documented',
    subjectCount: 0,
    lastUpdated: 'Jul 2026',
    contributors: BUTTERFLIES_CONTRIBUTORS,
    relatedSlugs: ['birds-of-bhopal', 'heritage-monuments-of-bhopal'],
  },

  'heritage-monuments-of-bhopal': {
    title: 'Heritage Monuments of Bhopal',
    slug: 'heritage-monuments-of-bhopal',
    description: 'Documenting the historic monuments, architecture, and cultural heritage of Bhopal through the lenses of BCC photographers.',
    about: [
      'Bhopal is a city of extraordinary heritage — the grand mosques of the Begum era, the Nawabi pavilions and dargahs, the colonial-era bungalows of Civil Lines, the carved havelis of the old city, and the centuries-old lake ghats that form the heart of the capital. This project is a photographic record of that heritage, documented by Bhopal Camera Club members who have walked these streets, alleys, and corridors with their cameras.',
      'Each Heritage Walk is a structured outing to a specific site or neighbourhood, led by a member with knowledge of its history and significance. Over time, this archive is building into a comprehensive visual survey of Bhopal\'s built heritage — a record that spans the intimate scale of a carved doorway and the civic grandeur of the Taj-ul-Masajid, all seen through the eye of a photographer.',
    ],
    apiTag: 'heritage-walks',
    subjectLabel: 'Locations Covered',
    subjectCount: 0,
    lastUpdated: 'Jul 2026',
    contributors: HERITAGE_CONTRIBUTORS,
    relatedSlugs: ['birds-of-bhopal', 'butterflies-of-bhopal'],
  },
};

export function getProject(slug: string): ProjectData | undefined {
  return PROJECTS[slug];
}

export function getRelatedProjects(currentSlug: string): ProjectData[] {
  const project = PROJECTS[currentSlug];
  if (!project) return [];
  return project.relatedSlugs
    .map(slug => PROJECTS[slug])
    .filter((p): p is ProjectData => p !== undefined);
}
