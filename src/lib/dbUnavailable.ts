export function dbUnavailablePayload(extra?: Record<string, any>) {
  return {
    ok: false,
    error: "db_unavailable",
    hint: "Start Docker Desktop and run: `docker compose up -d`, then run `npm run prisma:migrate` and `npm run prisma:seed`.",
    ...extra,
  };
}

export function isDbUnavailableError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Can't reach database server") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("P1001") ||
    msg.includes("Authentication failed") ||
    msg.includes("password authentication failed")
  );
}


