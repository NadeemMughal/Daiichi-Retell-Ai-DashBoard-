import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env", ".env.local"]) {
  const filePath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(filePath)) continue;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: tenants, error: tenantReadError } = await supabase.from("tenants").select("id,slug,display_name,status").neq("status", "archived");
if (tenantReadError) throw tenantReadError;
if (tenants.length !== 1) throw new Error(`Expected exactly one active tenant; found ${tenants.length}. No changes made.`);

const tenant = tenants[0];
const now = new Date().toISOString();
const { error: tenantUpdateError } = await supabase.from("tenants").update({ display_name: "Daiichi Technologies", slug: "daiichi-technologies", updated_at: now }).eq("id", tenant.id);
if (tenantUpdateError) throw tenantUpdateError;
const { error: connectionUpdateError } = await supabase.from("retell_connections").update({ name: "Daiichi Technologies", updated_at: now }).eq("status", "active");
if (connectionUpdateError) throw connectionUpdateError;

console.log(JSON.stringify({ ok: true, tenantId: tenant.id, workspace: "Daiichi Technologies", slug: "daiichi-technologies" }, null, 2));
