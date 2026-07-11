// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://bcc.bhopal.info',
  output: 'static',
  integrations: [sitemap()],
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
