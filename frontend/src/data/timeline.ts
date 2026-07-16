export interface Chapter {
  id: string;
  year: string;
  shortYear: string;
  title: string;
  subtitle: string;
  story: string;
  hasPhoto: boolean;
  photo?: string;
  photoAlt?: string;
  photoLabel?: string;
  photographer?: string;
  placeholderLabel?: string;
}

export const chapters: Chapter[] = [
  {
    id: 'chapter-1',
    year: '2015',
    shortYear: '2015',
    title: 'The Spark',
    subtitle: 'Before the club, there was a conversation.',
    story: 'In 2015, a handful of photographers in Bhopal found each other — not through a formal structure, but through a shared impulse. They loved photography and they loved this city, and they believed, without quite articulating it yet, that the best way to learn was to go out together and make photographs. There was no constitution, no membership form, no committee. There was just a group of people with cameras and a city worth photographing.',
    hasPhoto: false,
    placeholderLabel: 'No archival photograph for this chapter · 2015',
  },
  {
    id: 'chapter-2',
    year: 'Apr 2016',
    shortYear: 'Apr 16',
    title: 'First Official Photowalk',
    subtitle: 'The walk that started everything.',
    story: 'On 17 April 2016, Bhopal Camera Club held its first organised photowalk — a Heritage Walk at Taj-ul-Masajid, one of the largest mosques in Asia and one of Bhopal\'s most photogenic landmarks. Seventeen members turned up. The photowalk established a pattern that would define the club for the decade to come: go somewhere worth photographing, go together, and bring your best attention.',
    hasPhoto: true,
    photo: '/images/FirstPhotoWalk-HeritageWalkat Tajul Masajid.jpeg',
    photoAlt: 'First BCC photowalk at Taj-ul-Masajid — 17 April 2016',
    photoLabel: 'First Photowalk · Taj-ul-Masajid · 17 April 2016',
    photographer: 'BCC Member',
  },
  {
    id: 'chapter-3',
    year: 'Jun 2016',
    shortYear: 'Jun 16',
    title: 'A Digital Community',
    subtitle: 'Going online changed everything.',
    story: 'On 8 June 2016, BCC\'s official Facebook group was created. What had been a local gathering of photographers now had a permanent digital home — a place to share work, announce walks, discuss technique, and welcome new members. The group grew steadily. It became the connective tissue for a community that was, in spirit, already much larger than its founding circle.',
    hasPhoto: false,
    placeholderLabel: 'Facebook group launch · 8 June 2016 · No archival photograph',
  },
  {
    id: 'chapter-4',
    year: 'Aug 2017',
    shortYear: 'Aug 17',
    title: 'The Beginning',
    subtitle: 'Early members by the lake.',
    story: 'By August 2017, BCC had found its rhythm. Regular photowalks, a growing membership, and the shared experience of photographing Bhopal together had created something that felt less like a club and more like a community. On 10 August 2017, members gathered at the Lower Lake — one of the city\'s defining photographic subjects — for a walk that would later be remembered as one of the most photographed gatherings in the club\'s early years.',
    hasPhoto: true,
    photo: '/images/GroupPhotoafteraPhotoWalkatManavSanghralaya2018.jpeg',
    photoAlt: 'Early BCC members on a photowalk — 2017',
    photoLabel: 'Early Members · Lower Lake · 10 August 2017',
    photographer: 'Goutam Mitra',
  },
  {
    id: 'chapter-5',
    year: '2017–18',
    shortYear: '17–18',
    title: 'Growing Together',
    subtitle: 'The community finds its shape.',
    story: 'The 2017–18 season marked BCC\'s most significant period of growth. Workshops started appearing alongside photowalks. Mentors began leading dedicated sessions — on street photography, on composition, on post-processing. Members who had started as beginners were becoming serious photographers. The community photographed by Goutam Mitra during one of those walks captures something that no committee report could: the energy of a group of people who have found their people.',
    hasPhoto: true,
    photo: '/images/P1010146.jpg',
    photoAlt: 'BCC community on photowalk — 2017–2018, photograph by Goutam Mitra',
    photoLabel: 'Community Photowalk · 2017–2018',
    photographer: 'Goutam Mitra',
  },
  {
    id: 'chapter-6',
    year: 'Oct 2019',
    shortYear: 'Oct 19',
    title: 'A Registered Society',
    subtitle: 'Institutional recognition for an established community.',
    story: 'In October 2019, Bhopal Camera Club was formally registered as a society under the MP Society Registrikaran Adhiniyam 1973 — a legal recognition that reflected the weight of what the club had already become. Registration enabled the club to engage formally with national bodies, administer collaborative projects, and provide its members with the credibility of an institutional home. Corporate membership of the Federation of Indian Photography followed, connecting BCC to the national photography community as Member CM1098.',
    hasPhoto: false,
    placeholderLabel: 'Formal registration · October 2019 · No archival photograph',
  },
  {
    id: 'chapter-7',
    year: '2026',
    shortYear: '2026',
    title: 'A New Chapter',
    subtitle: 'A decade of documenting Bhopal.',
    story: 'A new platform, a new structure, and the same fundamental commitment. In 2026, Bhopal Camera Club launched bcc.bhopal.info — a permanent digital home for the club\'s archive, its members, and its story. A decade of photowalks, workshops, and exhibitions has produced a visual record of Bhopal that is already something of genuine historical value. The city has changed. The photographers have grown. The club continues — by the lakes, in the old city, at dawn and at dusk, making photographs that matter.',
    hasPhoto: true,
    photo: '/images/Kuldeep Tajul Masajid Evening.jpg',
    photoAlt: 'Taj-ul-Masajid at dusk — Bhopal, photograph by BCC member',
    photoLabel: 'Taj-ul-Masajid at dusk · Bhopal',
  },
];
