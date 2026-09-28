// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://bcc.bhopal.info',
  output: 'static',
  integrations: [
    sitemap({
      // Only genuinely indexable public pages: no authenticated hub, auth
      // forms, fallback/placeholder shells, legacy redirect stubs, or the
      // QA test account.
      filter: (page) => {
        const path = new URL(page).pathname;
        return !(
          path.startsWith('/hub/') || path === '/hub' ||
          path.startsWith('/auth/') ||
          path.startsWith('/gallery/photographer/') ||
          path === '/verify/' || path === '/verify-email/' ||
          path === '/photographers/_profile/' ||
          path === '/photographers/test/' ||
          path === '/showcase/placeholder/'
        );
      },
    }),
  ],
  vite: {
    css: {
      // Tell LightningCSS to target modern evergreen browsers including Firefox,
      // so it preserves both backdrop-filter (Firefox/Chrome) and
      // -webkit-backdrop-filter (Safari) in the output bundle.
      transformer: 'lightningcss',
      lightningcss: {
        targets: {
          chrome: 100 << 16,    // Chrome 100+
          firefox: 103 << 16,   // Firefox 103+ (first version with backdrop-filter unprefixed)
          safari: 15 << 16,     // Safari 15+
          edge: 100 << 16,      // Edge 100+
        },
      },
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  },
});
