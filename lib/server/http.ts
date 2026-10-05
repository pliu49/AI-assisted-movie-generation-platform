import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { NotFoundError } from "./db";

export type IdParams = { params: Promise<{ id: string }> };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a route handler so thrown errors become JSON responses. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof NotFoundError) return fail(err.message, 404);
      if (err instanceof ZodError) return fail(err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), 400);
      if (err instanceof SyntaxError) return fail("Invalid JSON body", 400);
      console.error(err);
      return fail(err instanceof Error ? err.message : "Server error", 500);
    }
  };
}
