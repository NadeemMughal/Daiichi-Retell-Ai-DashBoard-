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
// The direct (session) endpoint is preferred for DDL, but a project may only have
// the transaction pooler reachable. Try each before reporting a credential problem.
const endpoints = [
  { label: "DATABASE_DIRECT_URL", value: configuration.DATABASE_DIRECT_URL },
  { label: "DATABASE_URL", value: configuration.DATABASE_URL }
].filter((endpoint) => endpoint.value);
if (!endpoints.length) throw new Error("Missing database connection string.");

// Every migration after the foundation, in order. 0008 was previously missing from
// this list, so calls.contact_unmasked never reached the database and each call
// webhook failed on an unknown column.
const migrations = [
  "supabase/migrations/0007_dashboard_realtime_signals.sql",
  "supabase/migrations/0008_contact_privacy_and_effective_roles.sql",
  "supabase/migrations/0009_agent_realtime_signals.sql",
  "supabase/migrations/0010_retell_contacts.sql",
  "supabase/migrations/0011_session_export_fields.sql"
];
// duplicate table, object, schema and function. Re-running must not abort the rest.
const alreadyApplied = new Set(["42P07", "42710", "42P06", "42723"]);

async function applyWith(endpoint) {
  // pgbouncer transaction pooling cannot use prepared statements.
  const sql = postgres(endpoint.value, { ssl: "require", max: 1, connect_timeout: 20, prepare: !endpoint.value.includes("pgbouncer=true") });
  try {
    for (const filename of migrations) {
      try {
        await sql.unsafe(fs.readFileSync(filename, "utf8"));
        console.log(`Applied ${filename}`);
      } catch (error) {
        if (!alreadyApplied.has(error.code)) throw error;
        console.log(`Skipped ${filename} (already applied: ${error.code})`);
      }
    }
    // PostgREST caches the schema. A new column stays invisible to the Data API
    // until the cache reloads, which is what PGRST204 reports.
    await sql.unsafe("notify pgrst, 'reload schema'");
    console.log("Requested PostgREST schema reload");
  } finally {
    await sql.end();
  }
}

let applied = false;
for (const endpoint of endpoints) {
  try {
    console.log(`Connecting through ${endpoint.label}`);
    await applyWith(endpoint);
    applied = true;
    break;
  } catch (error) {
    if (error.code !== "28P01") throw error;
    console.log(`${endpoint.label} rejected the credentials (28P01)`);
  }
}
if (!applied) throw new Error("Every database endpoint rejected the password. Rotate the database password in Supabase and update DATABASE_URL and DATABASE_DIRECT_URL.");
