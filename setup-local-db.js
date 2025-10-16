const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

console.log("🚀 Setting up Local Database for UoPeople Chat");
console.log("==============================================\n");

// Check if DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL not found in environment variables");
  console.log("📝 Please add DATABASE_URL to your .env file:");
  console.log("   DATABASE_URL=postgresql://your-new-local-supabase-url");
  process.exit(1);
}

// Create database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Required for Supabase
  max: 20, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

async function setupDatabase() {
  try {
    console.log("🔌 Connecting to database...");

    // Test connection
    const client = await pool.connect();
    console.log("✅ Database connection successful");

    // Read and execute the schema file
    const schemaPath = path.join(__dirname, "db", "local_schema.sql");
    const schemaSQL = fs.readFileSync(schemaPath, "utf8");

    console.log("📋 Creating database tables...");

    // Split SQL into individual statements and execute
    const statements = schemaSQL
      .split(";")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await client.query(statement);
        } catch (error) {
          // Ignore "already exists" errors
          if (!error.message.includes("already exists")) {
            console.warn(`⚠️  Warning: ${error.message}`);
          }
        }
      }
    }

    console.log("✅ Database setup completed successfully!");
    console.log("\n📊 Created tables:");
    console.log("   - users (for authentication)");
    console.log("   - groups (for group chats)");
    console.log("   - group_members (group membership)");
    console.log("   - messages (chat messages)");
    console.log("   - notifications (user notifications)");
    console.log("   - user_settings (user preferences)");
    console.log("\n🧪 Test user created:");
    console.log("   Username: testuser");
    console.log("   Email: test@example.com");
    console.log("   Password: (you can update this later)");

    client.release();
  } catch (error) {
    console.error("❌ Database setup failed:", error.message);
    console.error("Full error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
