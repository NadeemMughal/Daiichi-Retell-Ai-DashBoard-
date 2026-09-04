import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";

// PostgREST answers PGRST204 when a payload names a column the deployed schema
// does not have, which happens when a migration has not been applied yet. An
// additive column must not take a whole ingestion path down with it, so callers
// drop the column, continue, and report the drift.
export function missingColumnFrom(error: PostgrestError | null | undefined) {
  if (!error || error.code !== "PGRST204") return null;
  return error.message.match(/'([^']+)' column/)?.[1] ?? null;
}

export function withoutColumn<T extends Record<string, unknown>>(rows: T[], column: string) {
  return rows.map((row) => {
    const copy = { ...row };
    delete copy[column];
    return copy;
  });
}
