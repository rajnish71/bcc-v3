import { BUILD_API_URL } from '../api';
import type { ProfileEntry } from '../../data/aboutPeople';
import type { PersonViewModel } from '../view-models/PersonViewModel';

export async function resolvePersonProfile(entry: ProfileEntry): Promise<PersonViewModel> {
  let resolvedName = entry.defaultName || '';
  let resolvedAvatar = entry.defaultAvatar;
  let resolvedProfileHref = entry.defaultProfileHref;
  let resolvedBio = entry.bioOverride || entry.defaultBio;

  if (entry.username) {
    resolvedProfileHref = `/photographers/${entry.username}/`;
    try {
      const res = await fetch(`${BUILD_API_URL}/photographers/${entry.username}`);
      if (res.ok) {
        const json = await res.json();
        const profile = json.data;
        if (profile) {
          resolvedName = profile.displayName || resolvedName;
          resolvedAvatar = profile.avatarUrl || resolvedAvatar;
          resolvedBio = entry.bioOverride || profile.bio || resolvedBio;
        }
      }
    } catch (e) {
      console.warn(`[personResolver] Failed to resolve profile for username: ${entry.username} at build time:`, e);
    }
  }

  return {
    name: resolvedName,
    avatar: resolvedAvatar,
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
