import fs from "node:fs";
import Retell from "retell-sdk";

for (const filename of [".env", ".env.local"]) {
  if (!fs.existsSync(filename)) continue;
  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const client = new Retell({ apiKey: process.env.RETELL_API_KEY, timeout: 20_000, maxRetries: 2 });
const suffix = String(Date.now()).slice(-4);
const phone = `+1202555${suffix}`;
let created;
try {
  created = await client.contact.create({ phone_number: phone, first_name: "Daiichi", last_name: "Sync Test", do_not_call: true });
  const listed = await client.contact.list({ limit: 1000, search_query: phone });
  const found = (listed.items ?? []).find((contact) => contact.contact_id === created.contact_id);
  if (!found) throw new Error("Created contact was not returned by Retell list.");
  console.log(JSON.stringify({ created: true, listed: true, contactIdMatched: true, fieldsMatched: found.first_name === "Daiichi" && found.last_name === "Sync Test" && found.do_not_call === true }));
} finally {
  if (created?.contact_id) {
    await client.contact.delete(created.contact_id);
    const afterDelete = await client.contact.list({ limit: 1000, search_query: phone });
    console.log(JSON.stringify({ cleanupDeleted: !(afterDelete.items ?? []).some((contact) => contact.contact_id === created.contact_id) }));
  }
}
