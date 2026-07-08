/**
 * Shared API configuration for BCC V3
 * Centrally defines default ports and base URLs for build-time static fetches.
 */

// Port default is 3001 as defined in backend/src/main.ts
export const BACKEND_PORT = 3001;

// Build-time base URL for static page generation fetches
export const BUILD_API_URL = `http://127.0.0.1:${BACKEND_PORT}/api/v1`;
