import fs from "node:fs";
import postgres from "postgres";

const configuration = {};
for (const filename of [".env", ".env.local"]) {
  if (!fs.existsSync(filename)) continue;
  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) configuration[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}
const connectionString = configuration.DATABASE_DIRECT_URL || configuration.DATABASE_URL;
if (!connectionString) throw new Error("Missing database connection string.");
const sql = postgres(connectionString, { ssl: "require", max: 1, connect_timeout: 20 });
try {
  for (const filename of ["supabase/migrations/0007_dashboard_realtime_signals.sql", "supabase/migrations/0009_agent_realtime_signals.sql", "supabase/migrations/0010_retell_contacts.sql"]) {
    await sql.unsafe(fs.readFileSync(filename, "utf8"));
    console.log(`Applied ${filename}`);
  }
} finally {
  await sql.end();
}
