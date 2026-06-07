require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("./db/dbconfig");

async function setupDatabase() {
  try {
    console.log("Setting up database schema for chat functionality...");

    // Read the SQL schema files
    const schemaPath = path.join(__dirname, "db", "chat_schema.sql");
    const schemaSQL = fs.readFileSync(schemaPath, "utf8");

    const channelsSchemaPath = path.join(__dirname, "db", "channels_schema.sql");
    const channelsSchemaSQL = fs.readFileSync(channelsSchemaPath, "utf8");

    const readReceiptsSchemaPath = path.join(__dirname, "db", "read_receipts_schema.sql");
    const readReceiptsSchemaSQL = fs.readFileSync(readReceiptsSchemaPath, "utf8");

    const combinedSQL = schemaSQL + "\n" + channelsSchemaSQL + "\n" + readReceiptsSchemaSQL;

    // Split the SQL into individual statements
    const statements = combinedSQL
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
          if (error.code === "42P07" || error.message.includes("already exists")) {
            // Table/column/index already exists, this is fine
            console.log(
              `危害 Statement ${i + 1}/${statements.length} - Already exists`
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
