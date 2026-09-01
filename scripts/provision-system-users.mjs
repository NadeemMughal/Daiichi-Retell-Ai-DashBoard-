import crypto from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !secret) throw new Error("Supabase server credentials are not configured.");

const requestedUsers = process.argv.slice(2).map((value) => {
  const [email, role, ...nameParts] = value.split(":");
  if (!email || !["super_admin", "operations_admin"].includes(role) || !nameParts.length) throw new Error(`Invalid user specification: ${value}`);
  return { email: email.toLowerCase(), role, name: nameParts.join(":") };
});
if (!requestedUsers.length) throw new Error("Provide at least one email:role:name argument.");

const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });

async function findUser(email) {
  for (let page = 1; page <= 100; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const match = result.data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) return match;
    if (result.data.users.length < 1000) return null;
  }
  throw new Error(`Unable to finish searching for ${email}.`);
}

for (const requested of requestedUsers) {
  const password = `${crypto.randomBytes(18).toString("base64url")}Aa1!`;
  const existing = await findUser(requested.email);
  const authResult = existing
    ? await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { ...existing.user_metadata, display_name: requested.name } })
    : await supabase.auth.admin.createUser({ email: requested.email, password, email_confirm: true, user_metadata: { display_name: requested.name } });
  if (authResult.error || !authResult.data.user) throw authResult.error ?? new Error(`Could not create ${requested.email}.`);
  const userId = authResult.data.user.id;

  const profile = await supabase.from("profiles").upsert({ id: userId, email: requested.email, display_name: requested.name, status: "active", updated_at: new Date().toISOString() });
  if (profile.error) throw profile.error;

  const currentRoles = await supabase.from("platform_role_assignments").select("id,role").eq("user_id", userId).is("scope_tenant_id", null);
  if (currentRoles.error) throw currentRoles.error;
  const now = new Date().toISOString();
  for (const row of currentRoles.data ?? []) {
    const update = await supabase.from("platform_role_assignments").update({ revoked_at: row.role === requested.role ? null : now }).eq("id", row.id);
    if (update.error) throw update.error;
  }
  if (!(currentRoles.data ?? []).some((row) => row.role === requested.role)) {
    const role = await supabase.from("platform_role_assignments").insert({ user_id: userId, role: requested.role });
    if (role.error) throw role.error;
  }

  process.stdout.write(`${requested.role === "super_admin" ? "Super Admin" : "Admin"}\t${requested.email}\t${password}\n`);
}
