Objective :

I. We have to create SiteHeader and SiteFooter, just copy the standard site header used in this project as a independent file, same for site footer.

II. We have to create fresh Design System file for V3 BCC - Systemdesign.md, token.css and make changes in wireframes and create new separate Low - fi files of following pages :



1.Home /

2\. Showcase Page /showcase

3\. Photographers Directory /photographers

4\. Photographer Profile Page  /photographers/\[username]  ( changing to /photographers/\[username] instead of gallery/photographer/\[username]. Multiple tabs

&#x09;i. .A. Profile Page — Portfolio Tab (default active state) Desktop 1280px · left  |  Mobile 390px · right

&#x09;ii. B. About Tab — shown when \[About] tab is active Desktop layout only · two-column · mobile collapses to single column

&#x09;iii. C. Contests Tab

&#x09;iv. D. Activity Tab (annotation only — no wireframe rendered): Chronological history of events attended (photowalk / workshop / exhibition / seminar), exhibitions participated in as submitting photographer, and volunteer slots 	completed. Each row: activity type badge + activity name + date + role. Same EventRow list pattern. Filterable by activity type and year.

5\. About /about

6\. Activities /activities

7\. Join  /join

8\. Journal /journal

9\. Journal Detail /journal/\[slug]

10\. Members hub - entire ecosystem





Please remember most of wireframes are already present we have to just make few changes , new wireframe structure can be found in this text document. But overall Design Style of project has to be followed unless mentioned otherwise.

In Claude design we have a project named - "V5  BCC Unified Platform Design System". In this project the main reference file is - "01 BCC Design Principles". We have to make certain changes in the reference file before we start editing wireframes.

After initial edit, BCC Design Principle updated file will become ultimate truth and reference point for rest of this project.

Majority of wireframes are in a file called - "02 V5 Clubbed Wireframes" ( Home, About, Activities, Join, Journal). Now while we have to follow same design principle but we need to create seperate Lo-fi wireframe files for each wireframes.

These files will have placeholders for standard site header and footer but attaching site header and footer is not required.

following files are already independent - "03 BCC Showcase", "04 BCC Hub Visual Master"

New new created files has to be renamed as :

a. "V6 00 BCC Design Principles"

b. "V6 01 Home"

c. "V6 02 About"

d. "V6 03 Showcase"

e. "V6 04 Photographers Directory"

f. "V6 05 Photographers Profile Page"

g. "V6 06 Activities"

h. "V6 07 Journal Main Page"

i. "V6 08 Journal Article Page"

j. "V6 09 Members Hub Main Home"

k. "V6 10 Members Hub Portfolio"

l. "V6 11 Members Hub Upload"

m. "V6 12 Members Hub Batch Upload" ( edit 10 July - retiring this idea and we using 12 for Member Hub Naviagtion)

n. "V6 13 Members Hub Profile"

o. V6 14

p. V6 15

q. V6 16

r. V6 17

s. V6 18

t. V6 19

u. V6 20

v. V6 21

w. "V6 99 systemdesign.md "

x. "V6 98 token.css"

y. "V6 91 SiteHeader"

z. "V6 92 SiteFooter"



The wireframe has to be compatible with our V3 architecture so if any audit is required please as Antigravity to do the audit. similarly as we will be creating these wireframes using Claude Design which itself is very memory intensive, the implementation of this new design system has to be done using Antigravity 2.0 hence we have to ensure there is no scope for ambiguity and transition is as smooth as possible. Once the new wireframes are designed we will delete old files so new set has to be complete in itself. To make it easier for Claude design, we should do it one step at a time and evrytime in a fresh chat under project so that context memory is utilised minimum.  We will start with BCC Design Principles followed by SiteHeader and Site Footer and then you decide the rest of workflow.



Please remember our tech stack is :

FINAL\_TECHNOLOGY\_STACK\_FREEZE

Status: FROZEN / AUTHORITATIVE

Authority: MISSION-007A

Frontend:  Astro (TypeScript, SSG/SSR hybrid, Vanilla CSS, Design Tokens, GSAP)

Backend:   NestJS + Fastify (TypeScript, Modular Monolith)

Database:  MySQL + Kysely (no ORM, database-first schema, SQL migrations)

API:       REST / JSON / /api/v1 / OpenAPI 3.x / Swagger / Typed Client Required

Auth:      DEFERRED (Session+JWT Hybrid OR JWT+Refresh Token)

Storage:   Cloudflare R2

CDN:       ImageKit.io

Infra:     Docker + Nginx + Linux (AWS compatible)

CI/CD:     Git + GitHub + GitHub Actions

FORBIDDEN:



Microservices

Polyrepo Architecture

Heavy ORM Dependency

GraphQL as Primary API

Multiple Frontend Frameworks

Dedicated Mobile Backend

Kubernetes (current stage)



also refer Bootstrap.md file and Phase\_Roadmap.md

Remember not to Drift, not to hallucinate. We are halting every thing else till we migrate these new design files.









Changes to be made to file name - "01 BCC Design Principles" under project "V5  BCC Unified Platform Design System" in Claude Design



Premium Editorial ×

Contemporary Luxury



01\. Visual Direction - Hybrid: "Refined Editorial Luxury"



02\. Header : Header as a State Machine

The header is a single Astro component (SiteHeader.astro) that renders one of six states ( Guest / User / Member / Content Editor / Moderator / Admin ) from session.role. Logo height 56px at rest, 44px when condensed on scroll.

Scroll behaviour (GSAP ScrollTrigger): At page top, nav background is fully transparent. After 60px scroll: backdrop-filter blur + dark semi-transparent fill (glassmorphic dark). Wireframe below shows the scrolled/opaque state. Active page link highlighted via Astro's built-in pathname detection.



Nav ITems - Home, About, Showcase. Activities ( Drop Down ). Learn ( Drop Down ), Membership, Journal





Admin Console — full administration, content and moderation. Never visible to lower roles.

Moderator Console - selected user roles like coordinator, author, editor, anyone with member + priviledges. Only those tabs visible for which their user role have permission. appears in nav (event, activity, gallery, content management). Member Hub + avatar persist.

Content Editor - Member + Journal Writer / editor role

Member - Logged in member privileges. Member Hub replaces all acquisition CTAs. Avatar opens profile menu (profile, my gallery, renewals, sign out). Join CTA removed. Member Hub button (satin gold outline) + avatar chip added. Nav unchanged.

User - User is not equals to Member , allowed to registeer as participate in contest, events in which non members are allowed

Guest - logged out state for public. Become a Member — the single gold CTA. Sign In stays quiet text. Goal: membership growth without clutter. Default public state. Nav shows discovery routes only. No role-gated items rendered server-side.



04\. Real-World Photography Handling



Instead of "The system never depends on curated ratios: grids enforce frame ratios via object-fit: cover with focal-point override; panoramas and full portraits get dedicated display modes."

Each photo retains its original aspect ratio. No object-fit cropping.



07\. Page Blueprints — Astro Component Trees



as per following wireframe plan :









\### Wireframe Nav

1\.  Nav auth buttons: "Register" → account creation flow (identity only, not membership). "Sign In" → returning-user login. When logged in, both are replaced by: avatar circle + "Member Hub" link. These are three separate states of the nav right-rail.

2\. Grouped nav is phase-scalable. Activities dropdown gains Contests + Exhibitions when those modules go live. Learn dropdown activates when Photography School launches.

3\. BCC Logo , About, Showcase, Activities, Journal, Learn  ( Showcase and Activities will have Dropdown. Greyed/non-interactive items: Learn (entire item + dropdown) is greyed until Photography School. Activities › Contests and Exhibitions greyed with COMING SOON pill until Phase 2b. )







\### Wireframe Footer

Rendered identically on every page. 3 row - center row 4-column grid,

Top row - FIP trust badge, social strip,

Middle Row 4 columns - . No page-specific footer variation. Column one (wider )- BCC Logo and brief description. column 2 - Navigate Column 3 - Explore Column 4 - Guidelines

Bottom Row - copyright bar and FIP details - Corporate Member of Federation of Indian Photography (CM 1098)





\### Wireframe Home /



\# Desktop



1\. SiteHeader {session}



2\. Hero - BCC Spotlight : Hero Spotlight: Admin-curated, one photo at a time, toggled from admin dashboard "Spotlight" panel. Falls back to most-recent gallery upload if no spotlight is set. Photo metadata (title, photographer, activity origin) is pulled from the gallery record.



3\. Club Stat - Live Stat Band : Stats bar — live API: All four numbers are fetched from the NestJS backend at page load (not hardcoded). GSAP counter animation triggers on scroll entry (ScrollTrigger, once:true). Amber top-border line is a design token, not wireframe styling.



4\. Our Members on the WAll - Justified grid — each photo retains its original aspect ratio. Each row is proportionally scaled so all photos fill the full 1200px content width with 8px gaps. Row height varies by content (shorter for wide landscapes, taller for portraits). Flickr justified-layout algorithm in Astro frontend. No object-fit cropping. Featured photos From Featured Photographers, rotating · max 1 per member · card → /photographer/\[slug]. hover: vf corners + overlay



5\. THE CLUB : One community. Four ways to participate. - 	"What We Do" cards: Link to Photowalks, Contests, Exhibitions, and Photography School module pages. All 4 nav links are present from launch; module pages go live progressively per phase roadmap. Cards show amber border on hover (GSAP or CSS).

&#x09;						Photowalks Explore Photowalks →

&#x09;						Photo Contests View Contests →

&#x09;						Exhibitions See Exhibitions →

&#x09;						Photography School

&#x09;						hover: amber border



6 Full-bleed featured activity image — 60vh - Featured Activity — admin-toggled: When toggle is OFF, this full-bleed section is absent entirely from the DOM — page flows directly from "What We Do" to "Upcoming Contest". When ON, admin selects which specific event to feature. Provision a dedicated toggle + event selector in the Admin Dashboard wireframe (separate deliverable).





7\. UPCOMING : What's happening : Events list — API-driven: Pulls next 3 upcoming events from the Events module API, ordered by date ascending. "ALL ACTIVITIES →" links to /events. Each \[REGISTER →] CTA links to the individual event registration page. "Members only" sub-note appears only when event eligibility is restricted to ACTIVE members — enforced at registration, not at list display. Section is always visible when at least one upcoming event exists. EXAMPLE CONTENT — upcomingEvents\[] · EventRow variant



8\. Photo Series : The city is our muse. : Lakes, forts, mosques and markets — our members document the extraordinary visual richness of Bhopal and beyond. EXAMPLE — featureBand.image · parallax-soft



9.Membership : 3-step flow diagram: Communicates that Registration (creating a platform identity) and Membership Application are two separate, sequential steps — directly enforcing the constitutional separation between identity and membership. Critical UX education for new visitors. Do not collapse into a single CTA. 3 public membership classes only: Basic Member, Student Member, Individual Member are the only classes shown on any public-facing page. Constitutional classes (Full, Life, Patron, Founding) are NOT surfaced here. The upgrade pathway for those is handled entirely inside the Member Hub after a user has already joined. EXAMPLE CONTENT — membershipPlans\[] · tier names/prices from CMS



10.Open Contest : Submit your best work : Contest strip — conditional render: Entire section only appears when at least one contest is in an active submission window (per the Contest module API). Hidden entirely otherwise — no empty state, no placeholder shown on the public page. Backend returns a flag; Astro SSR conditionally renders the section.



11\. Journals and Guides : Latest from the Journal : EXAMPLE CONTENT — recentPosts\[] · JournalCard standard variant



12\. Footer





\# Mobile :



1\. Header - Drawer: Nav links + \[Sign In] + \[Register] stacked at bottom



2\. Hero - BCC Spotlight



3\. Club Stat - Live Stat Band



4\. ON THE WALL - Our members, on the wall - 2-column grid (justified layout requires wider viewport)



5\. THE CLUB - One community. Four ways to participate.



6\. \[ Activity image ]⚙ ADMIN-TOGGLED  UPCOMING ACTIVITY



7\. UPCOMING : What's happening



8\. Heritage Series :



9\. MEMBERSHIP



10 open Contest



11\.  Journals and Guides



12\. Footer











BaseLayout

&#x20; SiteHeader {session}

&#x20; HeroShowcase {featuredPhotos\[]}

&#x20; StatBand {clubStats\[]}

&#x20; GalleryGrid {recentPhotos\[], cols:4}

&#x20; The Club

&#x20; Featured Activity

&#x20; EventRow x3 {upcomingEvents\[]}

&#x20; Story Series

&#x20; MembershipTiers {plans\[]}

&#x20; Open Contest

&#x20; JournalCard x3 {recentPosts\[]}

&#x20; SiteFooter {nav, social\[]}















\### Wireframe Showcase Page /showcase



\#Desktop



1\. SiteHeader {session} -



2\. PageHero {title, intro} : Showcase Hub : Explore award-winning portfolios, photography genres, and connect with local photographers. Member Portfolio Photographs by BCC members. Every image displayed at its original aspect ratio — as the photographer intended. Stats \[xxx photographs from yyy active BCC photographers]



3\.  FeaturedWork {featuredPhotos\[]}  Featured Work rotates with BCC Spotlight cadence



4\. GenrePlates {categories\[]} :  categories\[] · counts computed from photos collection. Filter bar sticks below the 68px nav on scroll so the grid is always accessible with filters in view. Genre pills scroll horizontally when they exceed viewport. All filters (genre, event, sort) are combinable — API query string builds from the active state of each control. Grid/List toggle switches the layout mode.



5\. Browse by Genre : Browse by genre, Selecting a genre filters the directory below .



5\. PhotographerDirectory :

&#x20;   DirectoryToolbar {query, genre, sort}

&#x20;   PhotographerCard grid - photographers\[] · paginated 24/page in production · names are placeholder. Justified grid — each photo retains its original aspect ratio. Each row is proportionally scaled so all photos fill the full 1200px content width with 8px gaps. Row height varies by row content. Algorithm: Flickr justified-layout (or equivalent). No CSS object-fit cropping applied. 5 rows shown (22 photos). Load More triggers paginated API fetch — not infinite scroll, to keep footer accessible. Hover State - \[Very Small Avatar] \[Photographer Name] \[Photo Title] \[Genre] \[Likes] \[Views]

&#x20;   EmptyState | Pagination



6\. BEHIND THE LENS : Featured photographers this month - Meet the members whose work fills this showcase. Badge colours applied in hi-fi per confirmed token set. In this wireframe badges are outline pills with the class label only. No application link or joining CTA is attached to any badge regardless of membership class — including constitutional classes (Full, Life, Patron, Founding). Badges are identification labels only. \[avatar] \[Member Class] \[Photographer Name] \[Genre (max photo)] \[XX] photos in showcase Member since \[YYYY] View Profile →



7\. ShowcaseBands {exhibitions\[]- ( From the exhibition halls Work shown at Bharat Bhavan, IGNCA and beyond → exhibitions\[] ), collections\[] - ( Curated series \& walks Monsoon Lakes, Heritage Walks, Birding mornings → collections\[]} )



8\. Footer



/showcase

BaseLayout

&#x20; SiteHeader {session} -

&#x20; PageHero {title, intro}

&#x20; FeaturedWork {featuredPhotos\[]}

&#x20; GenrePlates {categories\[]} -

&#x20; Browse by Genre

&#x20; PhotographerDirectory

&#x20;   DirectoryToolbar {query, genre, sort}

&#x20;   PhotographerCard grid

&#x20;   EmptyState | Pagination

&#x20; Featured Photographers

&#x20; ShowcaseBands {exhibitions\[], collections\[]}

&#x20; SiteFooter



\## Photographer Profile Page  /photographers/\[username]  ( changing to /photographers/\[username] instead of gallery/photographer/\[username]





\~ A. Profile Page — Portfolio Tab (default active state) Desktop 1280px · left  |  Mobile 390px · right



1\. SiteHeader {session}



2\. PortfolioHero {photographer} - cover photo · full viewport width · 260px tall · -  Manually selected / uploaded by the photographer.Falls back System Default ( We have to select one system default in advance and store) if none is set. \[Profile Header — same structure as above: cover strip + identity block + stats]



Identity Block - Avatar - Display Name - Class + Recognition Badges: Class badge = identification label only — no CTA, no joining pathway, no application link. Recognition badge = separate secondary pill with muted styling. Both shown simultaneously per MEM-006 single-active-recognition rule. Member holds ONE class badge + at most ONE active recognition badge.

specialties · location · since · counts



Stats are live API values: "Photos in Showcase" = approved portfolio photos with public visibility only. "Contest Awards" = Gold + Silver + Bronze wins only, not participations. "Events Attended" = total events attended. "Platform Points" = cumulative lifetime total per Module 12.



followed by Page Specific Navigation for different tabs - Portfolio, About, Contests, Activity





Everything below this will be 2 column layout. 1. Narrower Left corner approx. 1/4 th space ( Left Rail ) and Right Main Column with 3/4th space ( Main Content Area )



I. Right Main column ( Main Content Area )



3\. Bio - Intro 2 paragraphs - About Me Button that takes to B About Tab. lowest Row - Social Media and web links



4\. Signature / Featured Photo: Manually selected by the photographer from their uploaded portfolio via Member Hub dashboard. Photographer can update selection at any time. Falls back to most-recent approved upload if none is set.  Viewfinder crop-mark corners at all 4 corners. No viewfinder on cover strip (different context).



5\. photographer-created thematic collections · horizontal scroll strip · links to filtered showcase view.



6\.   GalleryGrid {photos\[], byPhotographer}     genre filter tabs   : All Portfolio Photos Portfolio  photographer's full upload library — Per-photo visibility: public / members-only / private. Private photos never shown on public profile regardless of visitor login state. Justified grid: original aspect ratios preserved, no cropping, 8px gaps, row height varies naturally. Desktop: proportional rows. Mobile: 2-column grid. Click on any photo will open lightbox, that will have 2 columns, left large column will show photo , right narrow column will have Caption, Description, EXIF details ( auto extracted at the time of uploading, otherwise option to manually add / edit exif). lightbox: contain, never crop



II. Left Narrow Column ( Left Rail )



7\. Profile Detail

&#x09;i.	Member Since

&#x09;ii.	Membership Class

&#x09;iii.	Primary Genre

&#x09;iv.	Expertise

&#x09;v.	Fav Subject

&#x09;vi.	Preferred Camera

&#x09;vii.	Distincions, Awards and Honors -  ( RTF Editor )

&#x09;viii.	Equipment Bag - a. Camera ('s) b. Lenses c. Other equipments

&#x09;

after above 2 columns back to single column



8\. RelatedPhotographers {sameGenres\[]}



9\. SiteFooter



\~ B. About Tab — shown when \[About] tab is active Desktop layout only · two-column · mobile collapses to single column



1\. SiteHeader {session}



2.\[Profile Header — same structure as above: cover strip + identity block + stats] followed by Page Specific Navigation for different tabs - Portfolio, About, Contests, Activity



Everything below this will be 2 column layout. 1. Main Left corner approx. 2/3rd space and Right Narrow Column with 1/3rd space



I. Left Main column ( Main Content Area )



3\. About - Full Bio. In the end Member Class and Member Since



4\. Last Row - All Web and Social Links



II. Right Narrow Column ( Right Rail )



5\. Camera Gears - Bodies - Lenses - Other Equipments. Camera Gear (self-declared): Entered by photographer in profile settings in Member Hub. No verification of ownership or accuracy. Shown publicly as-is. If photographer leaves it empty, the gear section is not rendered on the public profile.



6\. Achievements - First Upload, Contest Winner, X Events, Senior Member, X Photowalks, X Portfolio Series \[X] total badges earned · \[X] points this year



After this end 2 columns



7\. footer



\~ C. Contests Tab (annotation only — no wireframe rendered): Chronological list of all contest participations. Each row: photographer's submitted photo thumbnail (left) + contest name + theme + submission date + result badge (Gold / Silver / Bronze / Special Mention / Participated / Shortlisted). Filterable by year and result type. Follows EventRow list pattern established on the Home page "What's Happening" section.



\~ D. Activity Tab (annotation only — no wireframe rendered): Chronological history of events attended (photowalk / workshop / exhibition / seminar), exhibitions participated in as submitting photographer, and volunteer slots completed. Each row: activity type badge + activity name + date + role. Same EventRow list pattern. Filterable by activity type and year.







\### Wireframe Photographers Directory /photographers



1\. SiteHeader {session}



2\. PageHero {title, intro} - Stats



3\. FilterTabs {categories\[]}: Class filter lists all membership classes (Basic → Founding) for directory lookup purposes — not a membership promotion. Options: All Classes / Basic / Student / Individual / Full / Life / Patron / Founding Member. No joining CTA or application pathway is associated with any filter option or its results.



4\. Photographers Grid - Photographers Cards Grid - Initially Randomly Sorted.

Each card links to /photographers/\[username] — the individual Photographer Profile page. Profile page shows full portfolio, bio, gear list, contest history, and activity history.



HAS RECOGNITION BADGE. Class badge colour tokens (applied in hi-fi): Basic #5C5876 · Student #1A9DAE · Individual #3E5A48 · Full #F5A82A · Life #A8843C · Patron #8A6A2E · Founding #8A6A2E. In this wireframe all badges are outline pills only. No joining CTA or application link attached to any badge.



Recognition badges (Senior Member, Honorary Senior Member, Honorary Member, Honorary Mentor, Honorary Grandmaster) are separate from membership class badges. A member holds one class badge AND at most one active recognition badge. Both shown simultaneously on the card (class badge + smaller muted recognition pill below). Recognition does not affect or replace the class badge.





Empty state (not rendered — zero filter results): Card grid area replaced with: muted camera icon placeholder (grey) · "No photographers found matching your filters" · \[Clear Filters] amber ghost button. Header, search input, filter dropdowns, and results count bar all remain visible.



5\. Footer





V6 component tree stub (expand this into full wireframe):

&#x20; BaseLayout

&#x20;   SiteHeader {session}

&#x20;   PageHero {title, intro}

&#x20;   SearchFilter {genres\[], city}    ← confirm or redesign

&#x20;   PhotographerCard grid            ← 4-col desktop, 3-col tablet, 2-col mobile

&#x20;   Pagination                       ← confirm if needed

&#x20;   SiteFooter





\### About /about



1\. SiteHeader {session}



2\. PageHero {title, intro} - Stats



3\. Pillar Grid {pillars\[]} - 3 pillars -

&#x09;01 Community - Photography is most powerful when shared. Our club is a space where beginners find mentors and masters find inspiration.

&#x09;02 Craft - From technical excellence to artistic vision — structured programmes across genres, from street photography to astrophotography.

&#x09;03 City - Bhopal is our muse — its lakes, heritage, wildlife, and people. We document and celebrate this city's extraordinary visual richness.



4\. Timeline {milestones\[]} - Our Story - Legacy of Light -

&#x09;May 2015 - First informal grouping - A group of local photography enthusiasts began meeting informally in Bhopal to share critiques and capture the lakes together.

&#x09;Apr 2016 - First Organized Photowalk - Held on Heritage Day, our first structured walk took place at the historic Taj-ul-Masajid, establishing our core focus on documentation.

&#x09;Jun 2016 - Facebook Group Created - On June 8th, 2016, our official Facebook group was created, serving as the digital foundation for our growing community.

&#x09;Oct 2019 - Formal Society Registration - Bhopal Camera Club was formally registered as an official society under the MP Society Registrikaran Adhiniyam 1973.

&#x09;Jun 2026 - New Platform Launch - We launched the bcc.bhopal.info portal, expanding our school curriculum and preparing for our 10th anniversary next year.



5\. AffiliationBand {registrations\[]}



6\. LeadershipGrid {committee\[]} - Leadership - The Minds Behind the Club Passionate photographers who volunteer their time to keep BCC thriving. Rajnish, Kshitij, Rahil, Vikas, Ratan, Taurez, Yogesh



7\.  SiteFooter





BaseLayout

&#x20; SiteHeader

&#x20; PageHero {missionStatement}

&#x20; PillarGrid {pillars\[]}

&#x20; Timeline {milestones\[]}

&#x20; AffiliationBand {registrations\[]}

&#x20; LeadershipGrid {committee\[]}

&#x20; SiteFooter



\### Activities /activities



1\. SiteHeader {session}



2\. PageHero {title, intro} - Stats



3\. FilterTabs {categories\[]}: Sticky below PageHero once scrolled past page header. Type pills scroll horizontally on overflow. All filters (search, type, eligibility) are combinable API query params. Eligibility filter narrows the list — it does NOT hide events from public view. Every event stays visible to all visitors regardless of login state.



4\. Featured Event — admin-toggled: Same dashboard mechanism as the Featured Activity section on the Home page. When OFF, this section is absent entirely — page flows from filter bar directly to Upcoming Events. When ON, admin selects which specific event to feature.



5\. EventCard grid {events\[]} : UPCOMING - What's happening



List View : EventRow list: Same pattern as Home page "What's Happening." Events always shown publicly. Eligibility badge is informational — enforcement happens at registration, not at list display. "Membership required" note is a courtesy label only; the Register button is still shown. \[Join Waitlist →] appears when capacity is full. ₹ (INR) is the only currency used platform-wide.



Grid View : alternate display mode: Toggled by the \[⊞ Grid] button in the filter bar. Same underlying event data as List view, different visual density — grid favors browsing many events, list favors quick date scanning. Not a separate page or filter.



6\. Past Events strip: Links to an archive view (same /events page with a "Past" tab/filter applied). \[View Gallery →] links into /showcase filtered by that event — a Gallery module page, not part of Events. Attendance and photo-submission stats are live values from the Events module database. ARCHIVE - Past events - Browse BCC's complete activity history



7\.  SiteFooter







BaseLayout

&#x20; SiteHeader

&#x20; PageHero {title}

&#x20; FilterTabs {categories\[]}

&#x20; Featured Event

&#x20; EventCard grid {events\[]}

&#x20; Past Event

&#x20; SiteFooter





\### Join  /join



1\. SiteHeader {session}



2\. PageHero {title, intro}



3\. Application Workflow - Two-step flow diagram is the primary visual mechanism communicating MEM-006 P1 — identity and membership are separate, sequential steps, never a single "Join Now" button. Step 1 links to /register. Step 2 anchors down to the class cards (use Apply for appropriate Membership Category ) on this same page. Step 3 is aspirational/informational only — no link.

followed by CTA - Create your own account - already signed in - sign in link



4\. Membership Tiers - Only 3 operational classes exist on this page. Constitutional/voting classes (Full, Life, Patron, Founding) never appear here — no card, footnote, greyed placeholder, or mention. This is a hard governance rule (MEM-006), not a content decision.



"Recommended" label is admin-configurable from the dashboard — any of the 3 classes could carry this label depending on club strategy. Not hardcoded to Individual Member. It is the only card with a filled amber primary CTA; the other two use ghost/outline buttons.



Mobile card reordering: the featured/recommended class card is shown first on mobile for visibility. Desktop order follows class hierarchy (Basic → Student → Individual); mobile order follows recommendation priority instead.



5\. Comparison table : Values are illustrative placeholders. Actual entitlement values come from the class\_entitlements table (Module 02.10) — configurable per class from the admin panel, not hardcoded in the frontend. Mobile converts the table to 3 stacked per-class mini-cards with the same 8 rows, no horizontal scroll.



6\. ApplicationForm {formSchema} :     StepIndicator ,    FormStep x3 ,     SuccessState



7\. FAQ



8\. SiteFooter



BaseLayout

&#x20; SiteHeader

&#x20; PageHero {title, intro}

&#x20; Application Workflow

&#x20; MembershipTiers {plans\[]}

&#x20; Compare Table

&#x20; ApplicationForm {formSchema}

&#x20;   StepIndicator

&#x20;   FormStep x3

&#x20;   SuccessState

&#x20; FAQ

&#x20; SiteFooter



\### Journal /journal



1\. SiteHeader {session}



2\. PageHero {title, intro}



3\. Featured Article :   JournalCard featured {featuredPost}



4\. Article Grid : JournalCard grid {posts\[]}



5\.   Pagination



6\. SiteFooter





BaseLayout

&#x20; SiteHeader

&#x20; PageHero {title}

&#x20; JournalCard featured {featuredPost}

&#x20; JournalCard grid {posts\[]}

&#x20; Pagination

&#x20; SiteFooter







\### Journal Detail /journal/\[slug]



1\. SiteHeader {session}



2\.   ArticleHeader {post.meta}



3\. ArticleHero {post.heroImage}



4\.  ArticleBody {post.content}

&#x09;PullQuote, InlineFigure



5\.  AuthorCard {post.author}



6\.  RelatedPosts {related\[]}



7\.   SiteFooter







BaseLayout

&#x20; SiteHeader

&#x20; ArticleHeader {post.meta}

&#x20; ArticleHero {post.heroImage}

&#x20; ArticleBody {post.content}

&#x20;   PullQuote, InlineFigure

&#x20; AuthorCard {post.author}

&#x20; RelatedPosts {related\[]}

&#x20; SiteFooter



\#### File name "BCC Hub Visual Validation" in project "V5  BCC Unified Platform Design System" - As of now accept this as it is, we will change later





\### Member Hub /hub



Hub Shell :

fixed 240px rail at ≥1200px

240px holds all nine labels at full 15px with the gold-dot active state and keeps the 48px gutter rhythm intact; the content column lands at exactly 1024px — four clean portfolio columns. B saves width nothing uses and puts two labels at truncation risk. C trades permanent legibility for occasional width and requires an icon language Theme 2 doesn't have. Collapse behavior stays where Phase 9 put it: breakpoint-driven (rail → HubTabs <1200px → HubMobileBar ≤640px), never user-toggled.



\## Member Nav



4 Tabs on left rail -

1\. Studio - ( 4 sub nav )

&#x09;i. Home

&#x09;ii. Portfolio

&#x09;iii. Upload

&#x09;iv. Batch Upload



2\. Grow - ( 2 sub nav )

&#x09;i. Academy / Learn

&#x09;ii. Contest



3\. Club Activities

&#x09;i. Tours

&#x09;ii. Workshops

&#x09;iii. Photo Walks

&#x09;iv. Meetups



4\. Account

&#x09;i. My Profile ( Edit )

&#x09;ii. Membership and Billing





AuthLayout (role >= member)

&#x20; SiteHeader {session}

&#x20; HubSidebar {hubNav\[]}

&#x20; HubOverview {member, stats, events}

&#x20; MyGallery {memberPhotos\[]}

&#x20; ProfileSettings {member}





\## Hub Home / hub



VISUAL HIERARCHY

1\. Site Header



Left Rail

2\. Member Nav



Main Content Area

3\.  Greeting (Outfit 46px) — belonging - WelcomeBand — time-aware greeting (computed), tier line, public-portfolio link ↗, the view's one gold CTA.. Gold Upload — the verb

4\. AttentionRow — deadlines ≤3 computed urgencies, gold dots, mono dues; absent when empty (no "all caught up" filler).  ex Monsoon Frames closes in 3 days → Membership renews 1 Jul →

5\. Your photographs — the work - RecentWork — 5 newest as public-wall mats + dashed UploadTile; PENDING chips ride the mat label.

6\. Noticeboard - Happening at the Club - upcoming events in which participant has registered Club happenings — community

7\. Journey numbers — quietest voice - Learning Acacemy

8\. Personal rail — 	AcademyContinue (ProgressHairline),

&#x09;		MembershipCardDark compact,

&#x09;		Membership Card Thumbnail and link to Membership Card Management / Print

&#x09;		Member Stats below Membership Card - JourneyStrip (zero-value milestones dropped).



HubShell

├ WelcomeBand {member}

├ AttentionRow {items≤3}

├ RecentWork {photos≤5}+UploadTile

├ . I

≥1200 two-col · <1200 rail stacks below · ≤640 feed order per mobile spec; gold CTA migrates to HubMobileBar. Loading: shimmer blocks matching layout. Section fetch failure: per-section retry note, page never blanks.



One gold on the view (Upload). Attention row renders ≤3 computed items or disappears entirely. Mats reuse the public Gallery Wall plate; the dark membership card is one of only three sanctioned dark plates in the hub.



Photography ≈ 55% of content-column pixels in the populated state; statistics < 5%.



\##  Portfolio Manager — the curation room  /hub/portfolio



VISUAL HIERARCHY

1\. The photographs (mats)

2\. Selection state (gold rings)

3\. Page title + counts

4\. Toolbar (quiet, hairline)

5\. Status chips (smallest voice)



COMPOSITION + RESPONSIVE

PortfolioManager

├ Toolbar {genres, status, sort}

├ Wall｜List {photos\[]}

├ SelectionBar {selection}

└ InspectorPanel {photo, prev/next}

≥1200: 4-col, side inspector · 641–1199: 3-col, inspector = overlay sheet · ≤640: 2-col, long-press select, full-screen inspector sheet. Filtered-to-zero gets the public "no match + Clear filters" frame; loading = 8 shimmer mats.



\# Wireframe :



1\. Site Header



Left Rail

2\. Member Nav



Main Content Area



3\. Toolbar — DirectoryToolbar vocabulary: search, member's-genres-only chips, quiet Status/Sort selects, ▦/≣ view toggle.



4\. Wall｜List {photos\[]} : The photographs (mats) :  public MattedThumb 4-col; FEATURED gold flag; status chips ride the label; hover reveals ✎/☐ on the mat.



5\.   SelectionBar {selection} : Selection state (gold rings). Selected mats carry a 2px gold inset ring + filled check; the SelectionBar slides over the wall (shown at board scale for legibility — real height 56px). Delete is the only error-colored action and is text-weight only.  slides up on first selection; batch ops on existing APIs; Delete confirms.



6\. InspectorPanel — 420px side panel, ←/→ walk, contain preview, exhibition-label fields, EXIF mono chips, focal-point picker.



7\. SiteFooter





\## Single Upload — the submission desk /hub/upload



VISUAL HIERARCHY

1\. The photograph (≈60% of view)

2\. Title field — first ask

3\. Wall preview — consequence

4\. Gold submit — the verb

5\. Progress — quiet mono



COMPOSITION + RESPONSIVE

SingleUpload

├ UploadDropzone {limits}

├ Stage {file, progress}

├ MetadataPanel {photo} (shared)

└ WallPreview {label, focal}

≥900: side-by-side stage+label · <900: stacked, stage first · ≤640: native picker first, single vertical screen. Validation per frozen form spec (#A3493B border + message). Metadata survives upload failure.





\# Wireframe



1\. Site Header



Left Rail

2\. Member Nav



Main Content Area



3a. UploadDropzone  : dashed editorial frame; whole frame is target; limits from engine config; batch escape hatch in mono.. The invite is the page's empty state — an editorial frame, not a control. Drag-over: border turns gold, satin tint. Limits are rendered from engine config.



after the photo is uploaded or drag and dropped



3b. Upload runs in the background (gold hairline + mono %); the label is editable immediately. The wall preview is the signature moment — consequence, not summary. Submit disabled until required fields are valid.

&#x09;Left - Stage — contain on image backdrop, never cropped while editing; 3px gold progress hairline + mono %; failure keeps preview at 40% + retry.

&#x09;Right - Label + wall preview — required title/genre; EXIF auto mono chips; live MattedThumb shows public consequence; one gold submit.



4\. SiteFooter





\## Batch Upload — the contact sheet /hub/upload/batch



VISUAL HIERARCHY

1\. The frames (sheet ≈70%)

2\. Per-frame status corners

3\. Gold submit + ready count

4\. Apply-to-all bar

5\. Untitled gold dots



Errors are per-item and never modal. The sheet is the single source of truth — no wizard steps on desktop; uploading and labeling are concurrent.



COMPOSITION + RESPONSIVE

BatchUpload

├ ApplyToAllBar {genres, events}

├ ContactSheet {items\[], status}

├ InspectorPanel {item, walk}

└ ReviewBar {counts, submit}

≥1200: 8-col + side inspector · 641–1199: 6-col, inspector sheet · ≤640: sequenced flow (select → apply → swipe-label → review), 4-col sheet for triage. Resume-after-refresh restores uploaded items + metadata (engine-permitting; risk R2).





ANNOTATIONS

① Apply-to-all — genre/location/event for the whole batch; per-photo values always win; "From event" feeds the public originating-activity credit.

② ContactSheet — 8-col square thumbs, drop order preserved, status corner per frame, inline editable titles, trailing + tile.

③ ReviewBar — live math (total/ready/untitled/failed); counts filter the sheet on click; partial submit allowed; one gold.





$ Design other tabs in hub in accordance with above









\### Photography School and Photo Contest to be created later once we develop those engines















### 

##### **July 10th status after  Proposed Roadmap from here**



**Stage 1**                   ✅



V6 91  Site Header                  ✅

V6 92  Site Footer                  ✅



Public Pages

────────────

V6 01  Home                         ✅

V6 03  Showcase                       ✅ (existing)





Member Hub

────────────

V6 09  Hub Home                     ✅

V6 10  Portfolio                    ✅



**Short-Term Roadmap (Stage 2)**

────────────

PHASE A — Complete the Member Hub Foundation

A1. Freeze Hub Architecture ✅

A2. Navigation Authority - V6 12 — Members Hub Navigation ✅

A3. Reconcile Hub Home V6 09 — Members Hub Home ✅

A4. Reconcile Portfolio V6 10 — Portfolio ✅

A5. Reconcile Upload Studio V6 11 — Upload Studio ✅

A6. Implement Hub ✅

Claude Code implementation order

HubLayout ✅

&#x20;       ↓

HubSidebar ✅

&#x20;       ↓

HubPageHeader ✅

&#x20;       ↓

HubSection ✅

&#x20;       ↓

Navigation ✅

&#x20;       ↓

Hub Home ✅

&#x20;       ↓

Portfolio ✅

&#x20;       ↓

Upload Studio  ✅



A7. Validation --> Deploy --> Test --> Fix --> Git Commit --> Production-ready Hub  ✅



PHASE B — Legacy Profile Migration Audit ✅



PHASE C — Legacy Data Reconciliation ✅



PHASE D — Member Profile  ✅



V6 13 — Member Profile ✅

V6 19 - Membership / Consent form ✅

V6 20 - Account Setting ✅



\## PHASE E — Soft Pre-Launch \& Platform Stabilization

A. Move : v3bcc.bhopal.info --> bcc.bhopal.info ✅



B. Public Pages



\- V6 04 — Photographers Directory (Reconciliation)  ✅

\- V6 05 — Photographer Profile  ✅

\- V6 21 — Canonical Photo Page (Governed by PHOTO-ARCH-001)



\---



\### Membership Card



\- ⬜ V6 31 — Membership Card Design System



\---



\### Design Authority Reconciliation



\- ⬜ Membership Card widget reconciliation

\- ⬜ Responsive canonical Membership Card rendering

\- ⬜ Remove independent dark card implementation

\- ⬜ General Design Authority reconciliation



\---



\### System Deliverables



\- ⬜ V6 98 — token.css

\- ⬜ V6 99 — systemdesign.md



\---



\# PHASE E1 — Administration Architecture

✅ ADMIN-ARCH-001 — Administration Console Architecture Freeze v1.0



\---



C.

\### Design Authority Reconciliation : Stage 7 - Bug Fixes to be done along with this bugfixes.md



\- Membership Card widget reconciliation

\- Responsive canonical Membership Card rendering

\- Remove independent dark card implementation

\- General Design Authority reconciliation



\---



D.

\### System Deliverables



\- V6 98 — token.css

\- V6 99 — systemdesign.md



\---



**Stage 3 — Platform Completion**



PHASE F — Membership \& Billing



V6 14 — Membership \& Billing

V6 15 — V6 15 Future Modules Workspace



PHASE G — Collections \& Series



V6 16 — Collections \& Series

V6 17 Membership Card

V6 18 Notifications



PHASE H — Taxonomy Architecture



TAXONOMY\_ARCHITECTURE\_FREEZE\_v1.0.md





\## PHASE I — Remaining Public Pages



\### Public Pages



\- V6 02 — About

\- V6 06 — Activities

\- V6 07 — Journal

\- V6 08 — Journal Article



\### Authentication (Visual Reconciliation)



Existing functionality remains.



V6 visual refresh only.



\- Sign In

\- Register

\- Forgot Password

\- Reset Password

\- Verify Email



\---



**After this continuation of original roadmap plan :**



NEXT — Contest Engine \& Certificates



These are the only remaining Phase 2 modules. Nothing else blocks them.



\### Module 03 — Contest Management Engine

\- 15+ contest formats (monthly, open, invitational, portfolio, live, etc.)

\- Submission management with eligibility enforcement (MEM-006)

\- Full judging engine: blind/double-blind, multi-round, multi-criteria scoring

\- Results, awards, staged release

\- Entry fees → Module 11; communication triggers → Module 17



\### Module 12 — Certificates \& Badges

\- Template builder, all certificate types (participation, achievement, membership)

\- Badge library, points system, verification URLs

\- \*\*Dependency:\*\* Membership card (Module 02 revisit, open item #1) should be

&#x20; resolved before or during this module — they share PDF generation logic.



\### Module 11 — Financial Core (expand in Phase 2b)

\- Membership fee collection already wired from Phase 1

\- Expand: event fee collection, contest entry fees, expense recording, event P\&L,

&#x20; full INR ledger, Razorpay webhook handling, receipt generation



\---



\## PHASE 3 — Growth (after Phase 2b complete)

\- Module 09 — Community \& Social Engagement

\- Module 10 — Volunteer Management

\- Module 07 — Exhibition Management

\- Module 14 — Digital Archive (historical records import)

\- Module 16 — Mobile PWA (service worker, offline, push, QR scanner, install manifest)

\- Migration Track D — DNS cutover, legacy site decommission



\---



\## PHASE 4 — Intelligence

\- Module 08 — Photography School (full LMS, mentor system, assignments, certs)

\- Module 13 — Governance \& Admin advanced features

\- Module 15 — AI Ecosystem Phase 1 (auto-tagging, semantic search)

\- Native mobile: Capacitor wrapping Astro PWA → iOS + Android



\---



\## PHASE 5 — Scale (Year 3+)

\- Multi-tenancy groundwork

\- AI Phase 2: visual search, educational feedback, renewal prediction

\- Sub-groups / interest groups

\- Video contests, Open Badges, Lightroom plugin



\---



\## CONVERSATION-SPLITTING PLAN

\- This roadmap is updated at the end of every session — paste back the summary.

\- Each major build step gets its own fresh conversation pointed at this file.

\- \*\*Next session:\*\* Phase 2b — start with Module 03 (Contest Engine) or Module 12

&#x20; (Certificates \& Badges) — confirm which first.

