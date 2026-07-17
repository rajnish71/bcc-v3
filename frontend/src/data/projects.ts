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
    description: 'A living photographic record of Bhopal\'s extraordinary birdlife — from the winter migrants of Upper Lake to the forest raptors of Van Vihar.',
    about: [
      'Bhopal is one of India\'s most rewarding cities for birdlife. Its lakes, forested ridges, wetland margins, and urban greenways are home to over three hundred resident and migratory species — a number that grows with every season of attentive looking. This archive is a photographic record of that abundance, built encounter by encounter by the members of Bhopal Camera Club. Every photograph here was made in the field — in the reed beds before dawn, on the forest trails of Van Vihar, along the quiet shores where winter migrants arrive from Siberia and the Himalayan foothills.',
      'The archive is a living document. It grows with every bird walk, every photowalk, every hour of patient waiting at the water\'s edge. We record what we find, in the light we find it. Scroll through the collection. Linger on what you recognise. Let the unfamiliar stop you. And if you photograph birds in Bhopal, consider joining us.',
    ],
    apiTag: 'birds-of-bhopal',
    subjectLabel: 'Species Documented',
    subjectCount: 0,
    lastUpdated: 'Jul 2026',
    heroImage: 'https://ik.imagekit.io/duynda7oq/photos/16/2026/07/8ed8f2b9-3ecd-4313-8477-783c763eebb0.jpg',
    contributors: BIRDS_CONTRIBUTORS,
    relatedSlugs: ['butterflies-of-bhopal', 'heritage-monuments-of-bhopal'],
  },

  'butterflies-of-bhopal': {
    title: 'Butterflies of Bhopal',
    slug: 'butterflies-of-bhopal',
    description: 'A photographic record of the butterflies of Bhopal — from the common emigrants of city gardens to the rare seasonal visitors of the surrounding forests.',
    about: [
      'Bhopal\'s green corridors — the parks, forest edges, wetland margins, and garden walls of the City of Lakes — harbour a surprising abundance of butterfly life. Common Emigrants drift through urban gardens. Jezebels settle on flowering shrubs. Rare vagrants appear after the monsoon and vanish before anyone has quite confirmed what they were. This archive is a photographic record of that world, assembled by Bhopal Camera Club members who go into the field with a macro lens and a great deal of patience.',
      'The archive expands with each season — the monsoon arrivals, the dry-season specialists, the brief appearances of migrants passing through. We photograph what we encounter, where we encounter it. Browse the collection, pause on the details, and look for what you have never seen before. If you photograph butterflies in Bhopal, your images belong here.',
    ],
    apiTag: 'butterflies-of-bhopal',
    subjectLabel: 'Species Documented',
    subjectCount: 0,
    lastUpdated: 'Jul 2026',
    heroImage: 'https://ik.imagekit.io/duynda7oq/photos/17/2026/07/d5c7a90b-5703-48e7-bc2d-4565014675ce.jpg',
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
    heroImage: '/images/hero.jpg',
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
