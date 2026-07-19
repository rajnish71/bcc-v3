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
