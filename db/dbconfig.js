const { Pool } = require("pg");
require("dotenv").config();

const useDatabaseSsl = process.env.DATABASE_SSL !== "false";

const poolConfig = {
  connectionString: process.env.DATABASE_URL,
};

if (useDatabaseSsl) {
  poolConfig.ssl = {
    rejectUnauthorized: false,
  };
}

const pool = new Pool(poolConfig);

// An idle client in the pool (e.g. Supabase closing a connection server-side
// after a period of inactivity) emits 'error' on the pool itself, not on any
// query promise — with no listener here, that's an unhandled 'error' event,
// which Node treats as fatal and kills the whole process. This just happened
// live during session 10, taking the backend down with no query in flight to
// blame. Log and keep going instead; the pool creates a fresh connection for
// the next query on its own.
pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err);
});

// Test DB connection immediately
(async () => {
  try {
    await pool.query("SELECT 1"); // simple query to test
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection failed:", err);
  }
})();
module.exports = pool;
