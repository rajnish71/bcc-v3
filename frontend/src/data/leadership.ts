import { ikAvatarUrl } from '../lib/imagekit';

export interface LeaderProfile {
  name: string;
  role: string;
  bio: string;
  username?: string;
  avatar?: string;
}

export const leadership: LeaderProfile[] = [
  {
    name: 'Rajnish Khare',
    role: 'Club Coordinator',
    bio: 'Travel and wildlife photographer, and the founding coordinator of Bhopal Camera Club. Rajnish has been steering the club since its earliest days — building its community, shaping its programmes, and leading from the front on photowalks, workshops and exhibitions. He believes that photography is learned most deeply when learned together.',
    username: 'rajnishkhare',
    avatar: ikAvatarUrl('avatars/1/51392d1b-bd2d-4e90-8358-1d7dc5bfeb56.jpg', 176),
  },
  {
    name: 'Kshitij Patle',
    role: 'Joint Coordinator',
    bio: "Energetic travel storyteller who documents remote places, trails, and local interactions. Kshitij has been a core contributor to BCC's field programmes since 2016, co-leading photowalks and mentoring members on equipment selection and composition. His enthusiasm for being out in the field sets the tone for every walk he leads.",
    username: 'kshitijpatle',
    avatar: ikAvatarUrl('uploads/avatars/1781515190910-cb635096.jpg', 176),
  },
  {
    name: 'Rahil Khan',
    role: 'Secretary',
    bio: "Contemporary street visual artist capturing dynamic urban moments and frame compositions. Rahil joined BCC in 2016 and has since become one of the club's most consistent presences — on the street, at the committee table, and behind the scenes of the administrative work that keeps a volunteer-run society running.",
    username: 'rahilkhan',
    avatar: ikAvatarUrl('uploads/avatars/1781874918562-8ae28b6c.jpg', 176),
  },
];

export interface MentorProfile {
  name: string;
  role: string;
  expertise: string;
  bio: string;
  contribution: string;
  username?: string;
  avatar?: string;
}

export const mentors: MentorProfile[] = [
  {
    name: 'Dr. Anil Bhati',
    role: 'BCC Senior Mentor',
    expertise: 'Post Processing & Landscape',
    bio: "Dr. Bhati is a passionate travel and landscape photographer whose work spans Bhopal's lakes, architecture and surrounding wilderness. He has been the backbone of BCC's learning programme since the club's inception, bringing a methodical approach to both the field and the darkroom. His landscape photography — particularly his images of the Upper Lake and Bhopal's bridges — represents some of the finest technical work produced within the BCC community.",
    contribution: 'Conducted multiple workshops on composition, post-processing and editing that have shaped the visual vocabulary of nearly every active BCC member. Has mentored members at every stage of the craft — from beginners learning their first camera to practitioners developing a distinctive photographic voice.',
    username: 'anilbhati',
    avatar: ikAvatarUrl('uploads/avatars/1781581626973-a9db8ce9.jpg', 192),
  },
  {
    name: 'Sauvik Acharyya',
    role: 'BCC Mentor',
    expertise: 'Street Photography',
    bio: "Sauvik is one of those rare mentors who leads entirely from the front — he is always on the street, always shooting, and consistently among the first to spot a frame that others would walk past. His approach to street photography is instinctive but disciplined, and his ability to read a scene quickly has made him one of BCC's most sought-after guides for urban photography.",
    contribution: "Has been steering BCC's Street Walks with regularity and dedication, leading impromptu walks and formal sessions that have introduced dozens of members to the art of working in public spaces. His workshops on the ethics and aesthetics of street photography have helped members develop a more considered approach to photographing people.",
    username: 'sauvikacharyya',
    avatar: ikAvatarUrl('avatars/31/36bb7e58-8fc1-4bab-abac-152b5de535ae.jpg', 192),
  },
];
