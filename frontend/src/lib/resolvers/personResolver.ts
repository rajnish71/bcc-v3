import { BUILD_API_URL } from '../api';
import type { ProfileEntry } from '../../data/aboutPeople';
import type { PersonViewModel } from '../view-models/PersonViewModel';

/**
 * Platform-wide default avatar fallback.
 *
 * Used whenever a photographer has no profile photo. The BCC logo is used
 * intentionally rather than a generic silhouette so that the result looks
 * branded and complete rather than missing.
 *
 * This constant is the single source of truth for the avatar fallback policy
 * across Leadership, Mentors, Photographer Directory, Member Hub, Admin, and
 * any future PersonCard usage. Change it here and it applies everywhere.
 */
export const BCC_DEFAULT_AVATAR = '/images/bcc-logo-default.png';

/**
 * Strip HTML tags from a string that may contain raw markup from the API.
 * Prevents literal `<p>` etc. from appearing as text in the UI.
 */
function stripHtml(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim();
}

export async function resolvePersonProfile(entry: ProfileEntry): Promise<PersonViewModel> {
  // Bio is ALWAYS sourced from the bridge (Layer 1) — it is page-specific
  // editorial content and must never be overwritten by live API data.
  const resolvedBio = entry.defaultBio;

  // Name and avatar CAN be enriched from the live API when a username is
  // provided. Profile URL is also derived from the username when present.
  let resolvedName = entry.defaultName || '';
  let resolvedAvatar = entry.defaultAvatar;
  let resolvedProfileHref = entry.defaultProfileHref;

  if (entry.username) {
    resolvedProfileHref = `/photographers/${entry.username}/`;
    try {
      const res = await fetch(`${BUILD_API_URL}/photographers/${entry.username}`);
      if (res.ok) {
        const json = await res.json();
        const profile = json.data;
        if (profile) {
          // Use live display name if available; strip any stray HTML.
          if (profile.displayName) {
            resolvedName = stripHtml(profile.displayName);
          }
          // Use live avatar URL if the profile has one uploaded.
          if (profile.avatarUrl) {
            resolvedAvatar = profile.avatarUrl;
          }
        }
      }
    } catch (e) {
      console.warn(
        `[personResolver] Failed to resolve profile for username: ${entry.username} at build time:`,
        e,
      );
    }
  }

  // Platform-wide avatar fallback policy:
  // If no avatar is available after live resolution (and after bridge default),
  // use the official BCC logo so every card always has a valid image.
  const avatar = resolvedAvatar || BCC_DEFAULT_AVATAR;

  return {
    name: resolvedName,
    avatar,
    profileHref: resolvedProfileHref,
    bio: resolvedBio,
    eyebrow: entry.role,
    subtitle: entry.since ? `Since ${entry.since}` : undefined,
    contribution: entry.contribution,
  };
}

export async function resolvePeopleProfiles(entries: ProfileEntry[]): Promise<PersonViewModel[]> {
  return Promise.all(entries.map(resolvePersonProfile));
}
