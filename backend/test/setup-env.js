// Loads backend/.env so e2e specs hit the same database the app is configured for.
// Kysely is ESM-only; jest-e2e.json transforms it (transformIgnorePatterns) so the
// CommonJS Jest runtime can load src/database/db.ts.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
