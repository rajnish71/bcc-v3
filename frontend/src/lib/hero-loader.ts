/**
 * Client-side loader to fetch and render dynamic hero assignments.
 * Keeps PageHero component completely decoupled from page discovery and fetching logic.
 */
export async function loadPageHero(locationKey: string) {
  try {
    const res = await fetch('/api/v1/gallery/hero/location/' + encodeURIComponent(locationKey));
    if (res.ok) {
      const photo = await res.json();
      if (photo && photo.urls) {
        const banner = document.getElementById('page-hero-banner');
        const imgEl = document.getElementById('page-hero-img') as HTMLImageElement | null;
        const creditNameEl = document.getElementById('page-hero-credit-name');
        const creditContainer = document.getElementById('page-hero-credit');

        if (imgEl) {
          imgEl.src = photo.urls.original || photo.urls.medium || '';
          imgEl.alt = photo.title || 'Page Hero';
          if (banner) banner.style.display = 'block';
        }
        if (creditNameEl) {
          creditNameEl.textContent = photo.photographer ? photo.photographer.name : 'BCC Member';
        }
        if (creditContainer) {
          creditContainer.style.display = 'flex';
        }
      }
    }
  } catch (e) {
    console.error('Failed to load dynamic page hero for key: ' + locationKey, e);
  }
}

/**
 * Home page hero loader — uses Hero Assignment Architecture (heroManager.location("home")).
 * Tries /api/v1/gallery/hero/location/home first, falls back to /api/v1/gallery/spotlight.
 * Populates: home-hero-img, home-hero-kicker-text, home-hero-credit-name, home-hero-credit.
 * PageHero component is presentation-only; all fetching happens here.
 */
export async function loadHomeHero() {
  let photoUrl = '';
  let photographerName = '';

  try {
    const res = await fetch('/api/v1/gallery/hero/location/home');
    if (res.ok) {
      const photo = await res.json();
      if (photo && photo.urls) {
        photoUrl = photo.urls.original || photo.urls.medium || '';
        photographerName = photo.photographer?.name || '';
      }
    }
  } catch { /* fall through to spotlight */ }

  if (!photoUrl) {
    try {
      const res = await fetch('/api/v1/gallery/spotlight');
      if (res.ok) {
        const photo = await res.json();
        if (photo && photo.urls) {
          photoUrl = photo.urls.original || photo.urls.medium || '';
          photographerName = photo.photographer?.name || '';
        }
      }
    } catch { /* keep placeholder */ }
  }

  if (photoUrl) {
    const img = document.getElementById('home-hero-img') as HTMLImageElement | null;
    if (img) {
      img.src = photoUrl;
      img.alt = 'BCC Spotlight · Bhopal Camera Club';
      img.onload = () => {
        img.classList.add('loaded');
        document.getElementById('home-hero-fallback')?.remove();
      };
    }
  }

  const kickerTextEl = document.getElementById('home-hero-kicker-text');
  if (kickerTextEl) {
    kickerTextEl.textContent = photographerName
      ? `BCC Spotlight · ${photographerName}`
      : 'BCC Spotlight';
  }

  if (photographerName) {
    const creditNameEl = document.getElementById('home-hero-credit-name');
    const creditContainer = document.getElementById('home-hero-credit');
    if (creditNameEl) creditNameEl.textContent = photographerName;
    if (creditContainer) creditContainer.style.display = 'flex';
  }
}
