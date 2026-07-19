/**
 * aboutPeople.ts — Temporary bridge configuration for About page people.
 *
 * This is a temporary bridge. It exists only until the About Management
 * module is implemented in the Admin Console.
 *
 * The final source of this data will be the Admin Console.
 *
 * Ver2 spec: 6 Core Coordinators (3+3 grid) + 3 Mentors (3-col grid).
 */

import { ikAvatarUrl } from '../lib/imagekit';

export interface ProfileEntry {
  username?: string;
  role: string;
  since?: string;
  defaultName?: string;
  defaultAvatar?: string;
  defaultBio?: string;
  defaultProfileHref?: string;
  contribution?: string;
}

// ---------------------------------------------------------------------------
// Core Coordinators
// ---------------------------------------------------------------------------
export const leaders: ProfileEntry[] = [
  {
    defaultName: 'Rajnish Khare',
    role: 'Core Coordinator',
    since: '2015',
    defaultBio: 'Travel and wildlife photographer. Founder of Bhopal Camera Club. Steering the club since its earliest days, building the community and leading photowalks, workshops and exhibitions.',
    defaultAvatar: ikAvatarUrl('avatars/1/51392d1b-bd2d-4e90-8358-1d7dc5bfeb56.jpg', 176),
    defaultProfileHref: '/photographers/rajnishkhare/',
  },
  {
    username: 'kshitijpatle',
    role: 'Core Coordinator',
    since: '2016',
    defaultName: 'Kshitij Patle',
    defaultAvatar: ikAvatarUrl('uploads/avatars/1781515190910-cb635096.jpg', 176),
    defaultBio: 'Energetic travel storyteller documenting remote places, trails and local interactions.',
    defaultProfileHref: '/photographers/kshitijpatle/',
  },
  {
    defaultName: 'Rahil Khan',
    role: 'Core Coordinator',
    since: '2016',
    defaultBio: 'Contemporary street visual artist capturing dynamic urban moments and strong compositions.',
    defaultAvatar: ikAvatarUrl('uploads/avatars/1781874918562-8ae28b6c.jpg', 176),
    defaultProfileHref: '/photographers/rahilkhan/',
  },
  {
    username: 'imbablukhan',
    role: 'Social Media Coordinator',
    since: '2018',
    defaultName: 'Bablu Khan',
    defaultAvatar: ikAvatarUrl('uploads/avatars/1781876547600-cfa5d487.jpg', 176),
    defaultBio: "Social Media Coordinator for BCC and one of Bhopal's leading digital creators. Drives the club's online presence.",
    defaultProfileHref: '/photographers/imbablukhan/',
  },
  {
    username: 'yogiym',
    role: 'Bird Walk Leader',
    since: '2021',
    defaultName: 'Yogesh More',
    defaultAvatar: ikAvatarUrl('uploads/avatars/1781876800762-cb078e4d.jpg', 176),
    defaultBio: 'Head of the Birds of Bhopal Project. Naturalist and birding expert leading ethical bird walks and field activities.',
    defaultProfileHref: '/photographers/yogiym/',
  },
  {
    username: 'gangparivikas',
    role: 'Workshop Coordinator',
    since: '2020',
    defaultName: 'Vikas Gangpari',
    defaultAvatar: ikAvatarUrl('uploads/avatars/1781877028442-fbda284d.jpg', 176),
    defaultBio: 'Coordinates workshop logistics and supports indoor learning programmes throughout the year.',
    defaultProfileHref: '/photographers/gangparivikas/',
  },
];

// ---------------------------------------------------------------------------
// Mentors — 3-col grid (Ver2 spec)
// ---------------------------------------------------------------------------
export const mentors: ProfileEntry[] = [
  {
    defaultName: 'Dr. Anil Bhati',
    role: 'BCC Senior Mentor',
    since: '2015',
    defaultBio: "Dr. Bhati is a passionate travel and landscape photographer whose work spans Bhopal's lakes, architecture and surrounding wilderness. He has been the backbone of BCC's learning programme since the club's inception, bringing a methodical approach to both the field and the darkroom. His landscape photography — particularly his images of the Upper Lake and Bhopal's bridges — represents some of the finest technical work produced within the BCC community.",
    defaultAvatar: ikAvatarUrl('uploads/avatars/1781581626973-a9db8ce9.jpg', 192),
    defaultProfileHref: '/photographers/anilbhati/',
    contribution: 'Conducted multiple workshops on composition, post-processing and editing that have shaped the visual vocabulary of nearly every active BCC member. Has mentored members at every stage of the craft — from beginners learning their first camera to practitioners developing a distinctive photographic voice.',
  },
  {
    defaultName: 'Sauvik Acharyya',
    role: 'BCC Mentor',
    since: '2016',
    defaultBio: "Sauvik is one of those rare mentors who leads entirely from the front — he is always on the street, always shooting, and consistently among the first to spot a frame that others would walk past. His approach to street photography is instinctive but disciplined, and his ability to read a scene quickly has made him one of BCC's most sought-after guides for urban photography.",
    defaultAvatar: ikAvatarUrl('avatars/31/36bb7e58-8fc1-4bab-abac-152b5de535ae.jpg', 192),
    defaultProfileHref: '/photographers/sauvikacharyya/',
    contribution: "Has been steering BCC's Street Walks with regularity and dedication, leading impromptu walks and formal sessions that have introduced dozens of members to the art of working in public spaces. His workshops on the ethics and aesthetics of street photography have helped members develop a more considered approach to photographing people.",
  },
  {
    username: 'kshitijpatle',
    role: 'BCC Mentor',
    since: '2016',
    defaultBio: 'Kshitij is one of those mentors whose guidance extends far beyond the technical aspects of photography. Equally comfortable mentoring a youngster picking up a camera for the first time or an experienced member refining their craft, he is known for his practical, approachable teaching style and his willingness to share knowledge without hesitation. His interests in bird photography, nature observation and field techniques have made him a trusted resource for photographers across the club.',
    contribution: 'Has conducted numerous indoor workshops, field sessions and mentoring walks covering equipment selection, birding practices, composition and practical shooting techniques. His patient guidance and hands-on approach have helped members build confidence in the field, making him one of BCC\'s most dependable mentors and an important contributor to the club\'s learning culture.',
    defaultName: 'Kshitij Patle',
    defaultAvatar: ikAvatarUrl('uploads/avatars/1781515190910-cb635096.jpg', 192),
    defaultProfileHref: '/photographers/kshitijpatle/',
  },
];
