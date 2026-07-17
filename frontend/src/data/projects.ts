/**
 * projects.ts — Static project registry for BCC Special Projects.
 *
 * Editorial content (title, description, about, heroImage) lives here.
 * All statistics, contributors, and photographs are derived dynamically from the API.
 *
 * Every Special Project is based on exactly one canonical projectTag.
 * All API queries derive from projectTag — no multi-tag abstraction needed.
 */

export interface ProjectData {
  slug: string;
  title: string;
  description: string;
  about: string[];
  projectTag: string;
  heroImage?: string;
  relatedSlugs: string[];
}

export const PROJECTS: Record<string, ProjectData> = {
  'birds-of-bhopal': {
    slug:        'birds-of-bhopal',
    title:       'Birds of Bhopal',
    description: 'A living photographic record of Bhopal\'s extraordinary birdlife — from the winter migrants of Upper Lake to the forest raptors of Van Vihar.',
    about: [
      'Bhopal is one of India\'s most rewarding cities for birdlife. Its lakes, forested ridges, wetland margins, and urban greenways are home to over three hundred resident and migratory species — a number that grows with every season of attentive looking. This archive is a photographic record of that abundance, built encounter by encounter by the members of Bhopal Camera Club. Every photograph here was made in the field — in the reed beds before dawn, on the forest trails of Van Vihar, along the quiet shores where winter migrants arrive from Siberia and the Himalayan foothills.',
      'The archive is a living document. It grows with every bird walk, every photowalk, every hour of patient waiting at the water\'s edge. We record what we find, in the light we find it. Scroll through the collection. Linger on what you recognise. Let the unfamiliar stop you. And if you photograph birds in Bhopal, consider joining us.',
    ],
    projectTag:  'birds-of-bhopal',
    heroImage:   'https://ik.imagekit.io/duynda7oq/photos/16/2026/07/8ed8f2b9-3ecd-4313-8477-783c763eebb0.jpg',
    relatedSlugs: ['butterflies-of-bhopal', 'heritage-monuments-of-bhopal'],
  },

  'butterflies-of-bhopal': {
    slug:        'butterflies-of-bhopal',
    title:       'Butterflies of Bhopal',
    description: 'A photographic record of the butterflies of Bhopal — from the common emigrants of city gardens to the rare seasonal visitors of the surrounding forests.',
    about: [
      'Bhopal\'s green corridors — the parks, forest edges, wetland margins, and garden walls of the City of Lakes — harbour a surprising abundance of butterfly life. Common Emigrants drift through urban gardens. Jezebels settle on flowering shrubs. Rare vagrants appear after the monsoon and vanish before anyone has quite confirmed what they were. This archive is a photographic record of that world, assembled by Bhopal Camera Club members who go into the field with a macro lens and a great deal of patience.',
      'The archive expands with each season — the monsoon arrivals, the dry-season specialists, the brief appearances of migrants passing through. We photograph what we encounter, where we encounter it. Browse the collection, pause on the details, and look for what you have never seen before. If you photograph butterflies in Bhopal, your images belong here.',
    ],
    projectTag:  'butterflies-of-bhopal',
    heroImage:   'https://ik.imagekit.io/duynda7oq/photos/20/2026/07/c81bacc2-2278-4daf-b3ef-bde82f0f9003.jpg',
    relatedSlugs: ['birds-of-bhopal', 'heritage-monuments-of-bhopal'],
  },

  'heritage-monuments-of-bhopal': {
    slug:        'heritage-monuments-of-bhopal',
    title:       'Heritage Monuments of Bhopal',
    description: 'Documenting the historic monuments, architecture, and cultural heritage of Bhopal through the lenses of BCC photographers.',
    about: [
      'Bhopal is a city of extraordinary heritage — the grand mosques of the Begum era, the Nawabi pavilions and dargahs, the colonial-era bungalows of Civil Lines, the carved havelis of the old city, and the centuries-old lake ghats that form the heart of the capital. This project is a photographic record of that heritage, documented by Bhopal Camera Club members who have walked these streets, alleys, and corridors with their cameras.',
      'Each Heritage Walk is a structured outing to a specific site or neighbourhood, led by a member with knowledge of its history and significance. Over time, this archive is building into a comprehensive visual survey of Bhopal\'s built heritage — a record that spans the intimate scale of a carved doorway and the civic grandeur of the Taj-ul-Masajid, all seen through the eye of a photographer.',
    ],
    projectTag:  'heritage-walks',
    heroImage:   '/images/hero.jpg',
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
