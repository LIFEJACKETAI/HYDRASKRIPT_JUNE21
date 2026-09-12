// HydraSkript - UUID validation helper
//
// Prisma throws a raw 500 ("invalid input syntax for type uuid") when a
// non-UUID string reaches a `where: { id }` lookup. Dynamic [id] routes call
// this guard first so malformed ids return a clean 404 instead of leaking a
// database error to the client.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}
