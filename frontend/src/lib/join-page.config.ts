/**
 * join-page.config.ts — Canonical data layer for /join
 *
 * Single source of truth for all membership-related content on the public
 * Join page. Future MEM-008 changes that affect public-facing tier data,
 * eligibility, pricing, identity card copy, benefit pillars, or FAQ answers
 * must be made HERE — not in join.astro or any presentation component.
 *
 * MEM-006 PUBLIC DOMAIN POLICY:
 * Only operational classes are present: Basic · Student · Individual · Family · Corporate.
 * Full · Life · Patron · Founding MUST NEVER appear in this file or any file it feeds.
 *
 * Sections:
 *   BENEFIT_PILLARS      — §03 Why Become a Member (5 editorial pillars)
 *   IDENTITY_CARDS       — §04 Choose Your Membership (4 "who are you?" cards)
 *   PUBLIC_TIERS         — §05 Membership Comparison (5 public-class tiers)
 *   JOIN_FAQS            — §06 Frequently Asked Questions
 *   JOIN_COMMUNITY_ROWS  — §02 Community in Action (photo grid + editorial destinations)
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface BenefitPillar {
  number: string;
  title: string;
  body: string;
}

export interface IdentityCard {
  id: string;
  kicker: string;
  question: string;
  body: string;
  recommendedLabel: string;
}

export interface PublicTier {
  id: string;
  name: string;
  badge: string;
  who: string;
  eligibility: string;
  annual: string;
  period: string;
  benefits: string[];
  ctaHref: string;
  classCode?: string;
}

export interface JoinFaq {
  q: string;
  a: string;
}

export interface CommunityPhoto {
  label: string;
  aspectRatio: number;
  destination: string;
}

// ── §03 Benefit Pillars — community before commerce ───────────────────

export const BENEFIT_PILLARS: BenefitPillar[] = [
  {
    number: '01',
    title: 'Community',
    body: "Four hundred photographers who understand exactly what you're trying to do — and want to see you succeed at it.",
  },
  {
    number: '02',
    title: 'Learning',
    body: 'Every photowalk is a masterclass. Every workshop, an opportunity. Every critique, a gift from someone further along the same road.',
  },
  {
    number: '03',
    title: 'Participation',
    body: 'Compete, exhibit, contribute to the archive. Your photographs enter a shared body of work that outlasts any individual.',
  },
  {
    number: '04',
    title: 'Recognition',
    body: 'Your work is seen, discussed, and celebrated within a community that genuinely understands what went into making it.',
  },
  {
    number: '05',
    title: 'Growth',
    body: 'Access mentorship, critique, and sustained guidance from photographers who have walked the same path — and returned to help others.',
  },
];

// ── §04 Identity Cards — "which best describes you?" ──────────────────

export const IDENTITY_CARDS: IdentityCard[] = [
  {
    id: 'student',
    kicker: 'Student',
    question: "I'm a Student",
    body: "You're pursuing your passion for photography while studying. Learning from experienced photographers matters as much as the craft itself.",
    recommendedLabel: 'Student Membership',
  },
  {
    id: 'individual',
    kicker: 'Individual',
    question: 'I enjoy Photography',
    body: 'Photography is a serious pursuit — competitions, workshops, exhibitions, and building a body of work within a community of like-minded photographers.',
    recommendedLabel: 'Individual Membership',
  },
  {
    id: 'family',
    kicker: 'Family',
    question: 'We want to join together',
    body: 'Your household shares a love of photography. Photowalks are better together — and so is belonging to a community that celebrates the craft.',
    recommendedLabel: 'Family Membership',
  },
  {
    id: 'corporate',
    kicker: 'Corporate',
    question: "I'm representing an organisation",
    body: 'Your business or institution recognises the value of the photography community — for engagement, brand presence, or supporting the arts.',
    recommendedLabel: 'Corporate Membership',
  },
];

// ── §05 Public Membership Tiers — MEM-006 operational classes only ────
// Constitutional classes (Full · Life · Patron · Founding) are EXCLUDED.

export const PUBLIC_TIERS: PublicTier[] = [
  {
    id: 'basic',
    name: 'Basic',
    badge: 'BASIC',
    who: 'Photography enthusiasts beginning their journey.',
    eligibility: 'Open to all. No prior experience required.',
    // Fallback only -- membership.astro overrides this at build time from
    // GET /api/v1/membership/public/classes (class_entitlements.fee_inr).
    annual: '₹0',
    period: 'per year',
    benefits: [
      'Community membership',
      'Event access at member rates',
      'Monthly newsletter',
      'Community forum access',
    ],
    ctaHref: '/auth/register?plan=basic',
    classCode: 'BASIC_MEMBER',
  },
  {
    id: 'student',
    name: 'Student',
    badge: 'STUDENT',
    who: 'Full-time students with a passion for photography.',
    eligibility: 'Valid student ID from a recognised institution required.',
    // Fallback only -- see basic tier comment above.
    annual: '₹500',
    period: 'per year',
    benefits: [
      'All Basic benefits',
      'Competition eligibility',
      'Workshop priority access',
      'Mentorship programme',
      'Digital membership card',
    ],
    ctaHref: '/auth/register?plan=student',
    classCode: 'STUDENT_MEMBER',
  },
  {
    id: 'individual',
    name: 'Individual · Annual',
    badge: 'INDIVIDUAL',
    who: 'Serious photographers seeking full community participation.',
    eligibility: 'Open to all.',
    // Fallback only -- see basic tier comment above.
    annual: '₹1,200',
    period: 'per year',
    benefits: [
      'All Basic benefits',
      'Competition eligibility',
      'Exhibition participation',
      'Portfolio on bcc.bhopal.info',
      'Priority workshop booking',
      'Digital membership card',
    ],
    ctaHref: '/auth/register?plan=individual',
    classCode: 'INDIVIDUAL_MEMBER',
  },
  {
    id: 'individual-biennial',
    name: 'Individual · Biennial',
    badge: 'INDIVIDUAL',
    who: 'Serious photographers who want to commit for two years and save.',
    eligibility: 'Open to all.',
    // Fallback only -- see basic tier comment above.
    annual: '₹2,500',
    period: 'for 2 years',
    benefits: [
      'All Individual Annual benefits',
      '2-year validity',
      'Physical PVC membership card',
      'Welcome kit',
      'Higher activity + tour discounts',
    ],
    ctaHref: '/auth/register?plan=individual-biennial',
    classCode: 'INDIVIDUAL_BIENNIAL',
  },
  {
    id: 'family',
    name: 'Family',
    badge: 'FAMILY',
    who: 'Households where photography is a shared pursuit.',
    eligibility: 'Up to 4 members at the same address. Each receives an individual profile and membership number.',
    annual: '₹2,500',
    period: 'per year',
    benefits: [
      'All Individual benefits per member',
      'Shared family membership number',
      'Joint activity registrations',
      'Family photowalk priority',
    ],
    ctaHref: '/auth/register?plan=family',
  },
  {
    id: 'corporate',
    name: 'Corporate',
    badge: 'CORPORATE',
    who: 'Businesses and organisations supporting the photography community.',
    eligibility: 'Any registered entity. Two nominated individuals receive Individual membership.',
    annual: '₹8,000',
    period: 'per year',
    benefits: [
      'Two Individual memberships included',
      'Institutional recognition on bcc.bhopal.info',
      'Co-branding on selected activities',
      'Event sponsorship priority',
      'Annual impact report',
    ],
    ctaHref: '/auth/register?plan=corporate',
  },
];

// ── §06 FAQ Questions ──────────────────────────────────────────────────

export const JOIN_FAQS: JoinFaq[] = [
  {
    q: 'How long does the approval process take?',
    a: 'Most applications are reviewed within 5–7 working days. You will receive an email when your application is approved. During peak periods — typically the annual renewal season — this may extend to 10 working days.',
  },
  {
    q: 'What is the difference between Basic and Individual membership?',
    a: 'Basic provides community access and event participation at member rates. Individual adds competition eligibility, exhibition participation, a personal gallery portfolio on bcc.bhopal.info, and priority workshop booking. If you intend to participate fully in BCC activities, Individual is the right choice.',
  },
  {
    q: 'Can I upgrade my membership tier later?',
    a: 'Yes. You can upgrade at any time from your Member Hub. The difference in annual contribution is calculated pro-rata for the remaining period of your membership year. Upgrades take effect immediately upon payment confirmation.',
  },
  {
    q: 'Does Family membership include children?',
    a: 'Yes. Family membership covers up to four members residing at the same address, including children. Each family member receives an individual profile and their own membership number.',
  },
  {
    q: 'What if my application is not approved?',
    a: 'In the rare event an application is not approved, you will receive a communication explaining the reason. All contribution amounts are refunded in full. You are welcome to reapply after addressing the concern raised.',
  },
  {
    q: 'Is there a digital membership card?',
    a: 'Yes. Individual and above memberships include a digital membership card, available in the Member Hub after activation. The card displays your membership number, tier, and validity period.',
  },
  {
    q: 'Can I attend events before my membership is approved?',
    a: 'Public events that do not require membership are accessible to all registered users. Member-only events and competitions require an active approved membership.',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'All major methods are accepted — UPI, net banking, debit and credit cards, and mobile wallets. Payment is collected only after your application is reviewed and approved.',
  },
];

// ── §02 Community Activity Photo Grid ─────────────────────────────────
// Aspect ratios from Design Authority §03 wireframe.
// Destination keys are canonical editorial destinations registered in
// backend/src/modules/gallery/hero-destinations.config.ts.
// Images are loaded client-side; placeholders shown until assigned.

export const COMMUNITY_ROW_1: CommunityPhoto[] = [
  { label: 'Photowalk · MP Nagar', aspectRatio: 1.5,  destination: 'join.photowalk' },
  { label: 'Workshop',             aspectRatio: 0.8,  destination: 'join.workshop'  },
  { label: 'Annual Exhibition',    aspectRatio: 1.78, destination: 'join.exhibition' },
];

export const COMMUNITY_ROW_2: CommunityPhoto[] = [
  { label: 'Travel · Orchha',   aspectRatio: 1.78, destination: 'join.travel'     },
  { label: 'Wildlife Camp',     aspectRatio: 0.8,  destination: 'join.wildlife'   },
  { label: 'Mentoring Session', aspectRatio: 1.5,  destination: 'join.community'  },
];
