require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db/dbconfig");

async function setupDatabase() {
  try {
    console.log("Setting up database schema for chat functionality...");

    // Read the SQL schema file
    const schemaPath = path.join(__dirname, "db", "chat_schema.sql");
    const schemaSQL = fs.readFileSync(schemaPath, "utf8");

    // Split the SQL into individual statements
    const statements = schemaSQL
      .split(";")
      .map((stmt) => stmt.trim())
      .filter((stmt) => stmt.length > 0 && !stmt.startsWith("--"));

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          await pool.query(statement);
          console.log(`✓ Executed statement ${i + 1}/${statements.length}`);
        } catch (error) {
          if (error.code === "42P07") {
            // Table already exists, this is fine
            console.log(
              `⚠ Statement ${i + 1}/${statements.length} - Table already exists`
            );
          } else {
            console.error(
              `✗ Error in statement ${i + 1}/${statements.length}:`,
              error.message
            );
          }
        }
      }
    }

    console.log("Database setup completed successfully!");

    // Test the connection
    const result = await pool.query(
      "SELECT 'Database connection test' As message"
    );
    console.log("Database connection test:", result.rows[0].message);
  } catch (error) {
    console.error("Database setup failed:", error);
  } finally {
    await pool.end();
  }
}

setupDatabase();
