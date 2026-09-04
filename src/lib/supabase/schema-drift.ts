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

// A select names its columns instead of sending them, so the same drift surfaces
// as Postgres 42703 with the column spelled out in the message.
export function missingSelectColumnFrom(error: PostgrestError | null | undefined) {
  if (!error || (error.code !== "42703" && error.code !== "PGRST204")) return null;
  return error.message.match(/column "?(?:[\w]+\.)?([\w]+)"? does not exist/)?.[1] ?? missingColumnFrom(error);
}

export function withoutColumn<T extends Record<string, unknown>>(rows: T[], column: string) {
  return rows.map((row) => {
    const copy = { ...row };
    delete copy[column];
    return copy;
  });
}

// A single migration adds several columns at once, so retrying after one drop
// only moves the failure to the next column. Keep dropping until the write
// lands or nothing is left to drop, and hand back every column that was lost.
export async function writeWithSchemaDrift<T extends Record<string, unknown>, R extends { error: PostgrestError | null }>(
  rows: T[],
  write: (rows: T[]) => PromiseLike<R>
): Promise<{ result: R; dropped: string[] }> {
  let current = rows;
  const dropped: string[] = [];
  for (;;) {
    const result = await write(current);
    const missing = missingColumnFrom(result.error);
    if (!missing || !current.some((row) => missing in row) || dropped.includes(missing)) return { result, dropped };
    dropped.push(missing);
    current = withoutColumn(current, missing) as T[];
  }
}
