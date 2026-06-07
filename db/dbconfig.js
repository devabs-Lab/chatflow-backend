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
