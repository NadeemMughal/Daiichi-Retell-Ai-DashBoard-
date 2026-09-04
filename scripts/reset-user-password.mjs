// Sets a new password for one account and proves the new one signs in.
//
// Supabase stores only a bcrypt hash, so a forgotten password cannot be read
// back by anyone — it can only be replaced. Run this when an account is locked
// out and no one can reach it through the operations page: an ordinary admin
// cannot reset a Super Admin, because that is guarded by super_admin.manage.
//
//   node scripts/reset-user-password.mjs admin@daiichitechnologies.com
//   node scripts/reset-user-password.mjs someone@example.com "chosen password"
//
// Resetting does not end sessions the person already holds, and it will lock
// out anyone currently using the old password.

import fs from "node:fs";
import { randomBytes } from "node:crypto";

const configuration = {};
for (const filename of [".env", ".env.local"]) {
  if (!fs.existsSync(filename)) continue;
  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) configuration[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const url = configuration.SUPABASE_URL ?? configuration.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = configuration.SUPABASE_SECRET_KEY;
const anonKey = configuration.SUPABASE_PUBLISHABLE_KEY ?? configuration.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env");

const [email, requested] = process.argv.slice(2);
if (!email) throw new Error("Usage: node scripts/reset-user-password.mjs <email> [password]");

// Excludes characters that are misread off a screen (O/0, I/l/1) or that a
// shell would try to interpret when the password is pasted into a command.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const group = (length) => [...randomBytes(length)].map((byte) => alphabet[byte % alphabet.length]).join("");
const password = requested ?? `${group(6)}-${group(6)}-${group(6)}`;
if (password.length < 8) throw new Error("A password must be at least 8 characters.");

const authHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

const listed = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: authHeaders });
if (!listed.ok) throw new Error(`Could not list accounts: ${listed.status}`);
const user = ((await listed.json()).users ?? []).find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
if (!user) throw new Error(`No account exists for ${email}`);

const updated = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
  method: "PUT",
  headers: authHeaders,
  body: JSON.stringify({ password, email_confirm: true })
});
if (!updated.ok) throw new Error(`Reset failed: ${updated.status} ${(await updated.text()).slice(0, 200)}`);

// A reset that cannot then sign in is worse than none at all, so prove it.
let verified = "skipped (no publishable key in .env)";
if (anonKey) {
  const signIn = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  verified = signIn.ok ? "OK" : `REJECTED ${signIn.status} ${(await signIn.text()).slice(0, 160)}`;
}

console.log(`\n  account   : ${email}`);
console.log(`  password  : ${password}`);
console.log(`  sign-in   : ${verified}`);
console.log("\nStore this now — it cannot be read back again.\n");
