/**
 * aboutPeople.ts — Temporary configuration for About page people.
 *
 * TEMPORARY: will be replaced by Admin-managed backend data.
 * The page consumes this module; it knows nothing about hardcoded people.
 * When the backend is ready, swap these exports for API-fetched equivalents.
 *
 * Ver2 spec: 6 Core Coordinators (3+3 grid) + 3 Mentors (3-col grid).
 * Positions pending real data are marked with _pending: true.
 */

import { ikAvatarUrl } from '../lib/imagekit';

export interface ProfileEntry {
  name: string;
  role: string;
  since?: string;
  bio: string;
  avatar?: string;
  /** Full URL for the profile link. Configuration controls the destination — the page does not invent routing. */
  profileHref?: string;
  /** Mentor-only optional extension. Omit for leadership cards. */
  contribution?: string;
  /** Internal flag: position is unfilled — components should render a placeholder card. */
  _pending?: boolean;
}

// ---------------------------------------------------------------------------
// Core Coordinators — Row 1: Club · Joint · Secretary
//                     Row 2: Treasurer · Activity · Content
// ---------------------------------------------------------------------------
export const leaders: ProfileEntry[] = [
  {
    name: 'Rajnish Khare',
    role: 'Club Coordinator',
    since: '2015',
    bio: 'Travel and wildlife photographer, and the founding coordinator of Bhopal Camera Club. Rajnish has been steering the club since its earliest days — building its community, shaping its programmes, and leading from the front on photowalks, workshops and exhibitions. He believes that photography is learned most deeply when learned together.',
    avatar: ikAvatarUrl('avatars/1/51392d1b-bd2d-4e90-8358-1d7dc5bfeb56.jpg', 176),
    profileHref: '/photographers/rajnishkhare/',
  },
  {
    name: 'Kshitij Patle',
    role: 'Joint Coordinator',
    since: '2016',
    bio: "Energetic travel storyteller who documents remote places, trails, and local interactions. Kshitij has been a core contributor to BCC's field programmes since 2016, co-leading photowalks and mentoring members on equipment selection and composition. His enthusiasm for being out in the field sets the tone for every walk he leads.",
    avatar: ikAvatarUrl('uploads/avatars/1781515190910-cb635096.jpg', 176),
    profileHref: '/photographers/kshitijpatle/',
  },
  {
    name: 'Rahil Khan',
    role: 'Secretary',
    since: '2016',
    bio: "Contemporary street visual artist capturing dynamic urban moments and frame compositions. Rahil joined BCC in 2016 and has since become one of the club's most consistent presences — on the street, at the committee table, and behind the scenes of the administrative work that keeps a volunteer-run society running.",
    avatar: ikAvatarUrl('uploads/avatars/1781874918562-8ae28b6c.jpg', 176),
    profileHref: '/photographers/rahilkhan/',
  },
  // TODO: Fill Treasurer, Activity Coordinator, Content Coordinator
  // when coordinator data is available. Ver2 spec: 6 coordinators in 3+3 grid.
  {
    name: 'Treasurer',
    role: 'Treasurer',
    since: '—',
    bio: 'Profile coming soon.',
    _pending: true,
  },
  {
    name: 'Activity Coordinator',
    role: 'Activity Coordinator',
    since: '—',
    bio: 'Profile coming soon.',
    _pending: true,
  },
  {
    name: 'Content Coordinator',
    role: 'Content Coordinator',
    since: '—',
    bio: 'Profile coming soon.',
    _pending: true,
  },
];

// ---------------------------------------------------------------------------
// Mentors — 3-col grid (Ver2 spec)
// ---------------------------------------------------------------------------
export const mentors: ProfileEntry[] = [
  {
    name: 'Dr. Anil Bhati',
    role: 'BCC Senior Mentor',
    since: '2015',
    bio: "Dr. Bhati is a passionate travel and landscape photographer whose work spans Bhopal's lakes, architecture and surrounding wilderness. He has been the backbone of BCC's learning programme since the club's inception, bringing a methodical approach to both the field and the darkroom. His landscape photography — particularly his images of the Upper Lake and Bhopal's bridges — represents some of the finest technical work produced within the BCC community.",
    avatar: ikAvatarUrl('uploads/avatars/1781581626973-a9db8ce9.jpg', 192),
    profileHref: '/photographers/anilbhati/',
    contribution: 'Conducted multiple workshops on composition, post-processing and editing that have shaped the visual vocabulary of nearly every active BCC member. Has mentored members at every stage of the craft — from beginners learning their first camera to practitioners developing a distinctive photographic voice.',
  },
  {
    name: 'Sauvik Acharyya',
    role: 'BCC Mentor',
    since: '2016',
    bio: "Sauvik is one of those rare mentors who leads entirely from the front — he is always on the street, always shooting, and consistently among the first to spot a frame that others would walk past. His approach to street photography is instinctive but disciplined, and his ability to read a scene quickly has made him one of BCC's most sought-after guides for urban photography.",
    avatar: ikAvatarUrl('avatars/31/36bb7e58-8fc1-4bab-abac-152b5de535ae.jpg', 192),
    profileHref: '/photographers/sauvikacharyya/',
    contribution: "Has been steering BCC's Street Walks with regularity and dedication, leading impromptu walks and formal sessions that have introduced dozens of members to the art of working in public spaces. His workshops on the ethics and aesthetics of street photography have helped members develop a more considered approach to photographing people.",
  },
  // TODO: Fill third mentor position when data is available. Ver2 spec: 3 mentors.
  {
    name: 'BCC Mentor',
    role: 'BCC Mentor',
    since: '—',
    bio: 'Profile coming soon.',
    contribution: 'Contribution details to be added.',
    _pending: true,
  },
];
