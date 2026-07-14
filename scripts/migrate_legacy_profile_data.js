/**
 * scripts/migrate_legacy_profile_data.js
 *
 * One-time (idempotent) backfill of legacy photographer profile DATA from the
 * legacy `bcc` database into `bcc_v3`. The V3 schema/API/frontend already
 * support these fields — this fills the actual values that were never copied.
 *
 * Source of truth: bcc.bcc_photographers (Bootstrap rule 10).
 * Match key:       bcc_photographers.username = users.username
 *
 * POLICY — fill-if-empty. Any field a member has already set in V3 is left
 * untouched; only empty/missing V3 fields are populated. Safe to re-run.
 *
 * Migrated (this script):
 *   users.bio (HTML)         <- bio (plain -> paragraphs)
 *   users.tagline            <- tagline
 *   users.website_url        <- website_url
 *   users.preferred_camera_system <- preferred_camera_system
 *   users.year_joined_bcc    <- year_joined
 *   users.photography_genres <- niche + sub_genres (deduped)
 *   users.areas_of_expertise <- areas_of_expertise
 *   users.favourite_subjects <- favorite_subjects (note spelling)
 *   users.awards_html (HTML) <- distinctions.awards (text -> list)
 *   user_gear                <- equipment {cameras->BODY, lenses->LENS, drones+other->ACCESSORY}
 *   user_photo_titles        <- distinctions {fip,psa,fiap,other}
 *   user_social_handles      <- social_links
 *
 * NOT here (needs R2 upload — separate script):
 *   user_avatars / user_cover_photos  <- avatar_url / cover_photo_url
 *
 * Run (on the server, from repo root):
 *   set -a; source backend/.env; set +a
 *   DRY_RUN=1 node scripts/migrate_legacy_profile_data.js   # preview
 *   node scripts/migrate_legacy_profile_data.js             # apply
 */
'use strict';

const mysql = require('mysql2/promise');

const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

// Legacy system/non-member accounts — never migrate these (the `admin` row in
// particular carries a real member's display_name but placeholder profile data).
const SYSTEM_USERNAMES = new Set(['admin', 'guestuser', 'writer']);

const SOCIAL_MAP = {
  instagram: 'INSTAGRAM',
  flickr: 'FLICKR',
  youtube: 'YOUTUBE',
  fivehundredpx: 'FIVE_HUNDRED_PX',
  facebook: 'FACEBOOK',
  x: 'X_TWITTER',
  twitter: 'X_TWITTER',
  tiktok: 'TIKTOK',
  linkedin: 'LINKEDIN',
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bioToHtml(text) {
  if (!text || !String(text).trim()) return null;
  const t = String(text).trim();
  if (/<(p|br|div|ul|ol|strong|em|h[1-6])\b/i.test(t)) return t; // already HTML
  const paras = t.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(Boolean);
  if (!paras.length) return null;
  return paras.map(p => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('');
}

function awardsToHtml(text) {
  if (!text || !String(text).trim()) return null;
  const items = String(text).split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/^[-–—]{3,}$/.test(l))          // drop separator lines
    .map(l => l.replace(/^[-•·]\s*/, '').trim())
    .filter(Boolean);
  if (!items.length) return null;
  return '<ul>' + items.map(i => `<li>${escapeHtml(i)}</li>`).join('') + '</ul>';
}

// Legacy JSON columns arrive already parsed via mysql2. Normalise to array.
function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}
function asObj(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
  return {};
}
const clean = arr => arr.map(x => String(x).trim()).filter(Boolean);
const dedupe = arr => [...new Set(arr)];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'bcc_v3',
    multipleStatements: false,
  });

  console.log(`\n=== Legacy profile backfill ${DRY_RUN ? '(DRY RUN — no writes)' : '(APPLYING)'} ===\n`);

  const [legacy] = await conn.query('SELECT * FROM bcc.bcc_photographers');
  const summary = { matched: 0, unmatched: [], usersUpdated: 0, gear: 0, titles: 0, social: 0, bios: 0, awards: 0 };

  for (const p of legacy) {
    if (SYSTEM_USERNAMES.has(String(p.username || '').toLowerCase())) continue;
    // Match by username first; fall back to an exact full_name = display_name
    // match (legacy usernames were regenerated for some V3 users, e.g.
    // sanjayshukla -> sanjaykumarshukla). Username match is always preferred.
    const [urows] = await conn.query(
      'SELECT id, username, bio, tagline, website_url, preferred_camera_system, year_joined_bcc, photography_genres, areas_of_expertise, favourite_subjects, awards_html FROM users WHERE username = ? OR full_name = ? ORDER BY (username = ?) DESC LIMIT 1',
      [p.username, p.display_name, p.username],
    );
    if (!urows.length) { summary.unmatched.push(p.username || p.slug); continue; }
    const u = urows[0];
    summary.matched++;
    const changes = [];

    // ---- users scalar/JSON fields (fill-if-empty) ----
    const set = {};
    const bioHtml = bioToHtml(p.bio);
    if (bioHtml && (!u.bio || !String(u.bio).trim())) { set.bio = bioHtml; changes.push('bio'); summary.bios++; }
    if (p.tagline && String(p.tagline).trim() && (!u.tagline || !String(u.tagline).trim())) { set.tagline = String(p.tagline).trim(); changes.push('tagline'); }
    if (p.website_url && String(p.website_url).trim() && (!u.website_url || !String(u.website_url).trim())) { set.website_url = String(p.website_url).trim(); changes.push('website'); }
    if (p.preferred_camera_system && String(p.preferred_camera_system).trim() && (!u.preferred_camera_system || !String(u.preferred_camera_system).trim())) { set.preferred_camera_system = String(p.preferred_camera_system).trim(); changes.push('camera'); }
    if (p.year_joined && !u.year_joined_bcc) { set.year_joined_bcc = p.year_joined; changes.push('yearJoined'); }

    const genres = dedupe(clean([p.niche, ...asArray(p.sub_genres)]));
    if (genres.length && (!u.photography_genres || asArray(u.photography_genres).length === 0)) { set.photography_genres = JSON.stringify(genres); changes.push('genres'); }

    const expertise = dedupe(clean(asArray(p.areas_of_expertise)));
    if (expertise.length && (!u.areas_of_expertise || asArray(u.areas_of_expertise).length === 0)) { set.areas_of_expertise = JSON.stringify(expertise); changes.push('expertise'); }

    const favs = dedupe(clean(asArray(p.favorite_subjects)));
    if (favs.length && (!u.favourite_subjects || asArray(u.favourite_subjects).length === 0)) { set.favourite_subjects = JSON.stringify(favs); changes.push('favSubjects'); }

    const dist = asObj(p.distinctions);
    const awardsHtml = awardsToHtml(dist.awards);
    if (awardsHtml && (!u.awards_html || !String(u.awards_html).trim())) { set.awards_html = awardsHtml; changes.push('awardsHtml'); summary.awards++; }

    if (Object.keys(set).length) {
      summary.usersUpdated++;
      if (!DRY_RUN) {
        const cols = Object.keys(set);
        await conn.query(`UPDATE users SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map(c => set[c]), u.id]);
      }
    }

    // ---- user_gear (only if user has none) ----
    const [[gc]] = [await conn.query('SELECT COUNT(*) AS c FROM user_gear WHERE user_id = ?', [u.id])];
    if (Number(gc[0].c) === 0) {
      const eq = asObj(p.equipment);
      const rows = [];
      for (const l of clean(asArray(eq.cameras))) rows.push([u.id, 'BODY', l]);
      for (const l of clean(asArray(eq.lenses))) rows.push([u.id, 'LENS', l]);
      for (const l of clean([...asArray(eq.drones), ...asArray(eq.other)])) rows.push([u.id, 'ACCESSORY', l]);
      if (rows.length) {
        changes.push(`gear x${rows.length}`);
        summary.gear += rows.length;
        if (!DRY_RUN) await conn.query('INSERT INTO user_gear (user_id, gear_type, label) VALUES ?', [rows]);
      }
    }

    // ---- user_photo_titles (only if user has none) ----
    const [[tc]] = [await conn.query('SELECT COUNT(*) AS c FROM user_photo_titles WHERE user_id = ?', [u.id])];
    if (Number(tc[0].c) === 0) {
      const rows = [];
      let so = 10;
      const add = (bodyCode, bodyName, val) => {
        const v = val == null ? '' : String(val).trim();
        if (v) { rows.push([u.id, bodyCode, v, bodyName, so]); so += 10; }
      };
      add('FIAP', 'FIAP', dist.fiap);
      add('FIP', 'FIP', dist.fip);
      add('PSA', 'PSA', dist.psa);
      add('OTHER', 'Other', dist.other);
      if (rows.length) {
        changes.push(`titles x${rows.length}`);
        summary.titles += rows.length;
        if (!DRY_RUN) await conn.query('INSERT INTO user_photo_titles (user_id, body_code, title_code, body_name, sort_order) VALUES ?', [rows]);
      }
    }

    // ---- user_social_handles (only if user has none) ----
    const [[sc]] = [await conn.query('SELECT COUNT(*) AS c FROM user_social_handles WHERE user_id = ?', [u.id])];
    if (Number(sc[0].c) === 0) {
      const links = asObj(p.social_links);
      const rows = [];
      for (const [key, val] of Object.entries(links)) {
        const platform = SOCIAL_MAP[key.toLowerCase()];
        const v = val == null ? '' : String(val).trim();
        if (platform && v) rows.push([u.id, platform, v]);
      }
      if (rows.length) {
        changes.push(`social x${rows.length}`);
        summary.social += rows.length;
        if (!DRY_RUN) await conn.query('INSERT INTO user_social_handles (user_id, platform, handle_or_url) VALUES ?', [rows]);
      }
    }

    const label = u.username === p.username ? p.username : `${p.username} -> ${u.username}`;
    console.log(`  ${label.padEnd(34)} ${changes.length ? changes.join(', ') : '(nothing to fill)'}`);
  }

  console.log('\n=== Summary ===');
  console.log(`  matched users:      ${summary.matched}/${legacy.length}`);
  console.log(`  users updated:      ${summary.usersUpdated} (bios: ${summary.bios}, awards_html: ${summary.awards})`);
  console.log(`  gear rows added:    ${summary.gear}`);
  console.log(`  title rows added:   ${summary.titles}`);
  console.log(`  social rows added:  ${summary.social}`);
  console.log(`  unmatched legacy usernames (no V3 user): ${summary.unmatched.length ? summary.unmatched.join(', ') : 'none'}`);
  console.log(DRY_RUN ? '\n(DRY RUN — nothing written)\n' : '\nDone.\n');

  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
