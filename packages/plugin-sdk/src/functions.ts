"use client";

import { getSupabase } from "./client";

/**
 * Call a module's Supabase Edge Function (deployed as `<moduleId>-<name>`) from
 * the browser. The anon key + auth are attached automatically; the function
 * itself is the write path for public actions the read-only dashboard can't do
 * directly (e.g. posting a comment). Throws Error(message) on a non-2xx response,
 * surfacing the function's `{ error }` body when present.
 *
 * @example
 * await invokeModuleFunction("newsroom", "comment", {
 *   article_id, author_name, body,
 * });
 */
export async function invokeModuleFunction<T = unknown>(
  moduleId: string,
  name: string,
  body?: unknown,
): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke(`${moduleId}-${name}`, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    let message = error.message;
    // supabase-js FunctionsHttpError carries the Response in `.context`.
    const ctx = (error as { context?: Response }).context;
    try {
      const j = ctx && (await ctx.json());
      if (j && typeof j.error === "string") message = j.error;
    } catch {
      /* keep the default message */
    }
    throw new Error(message);
  }
  return data as T;
}
