// The DB layer is pinned to UTC (database/db.ts, WP3). Specs that model stored
// DATETIME text parse it with new Date(), so the test process must run in UTC
// unless a run explicitly sets TZ (e.g. TZ=Asia/Kolkata for tenure TZ checks).
module.exports = async () => {
  if (!process.env.TZ) process.env.TZ = 'UTC';
};
