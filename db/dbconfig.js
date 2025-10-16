const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
  // ssl: {
  //   require: true,
  //   rejectUnauthorized: false, // Required for Supabase SSL
  // },
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
