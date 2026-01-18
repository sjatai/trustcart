export function dbUnavailablePayload(extra?: Record<string, any>) {
  return {
    ok: false,
    error: "db_unavailable",
    hint:
      "Database is not reachable or not configured.\n\n" +
      "Do this once:\n" +
      "- Ensure `DATABASE_URL` is set (e.g. in `.env.local`)\n\n" +
      "Then start Postgres + migrate/seed:\n" +
      "- Start Docker Desktop\n" +
      "- Run `docker compose up -d`\n" +
      "- Run `npm run prisma:migrate`\n" +
      "- Run `npm run prisma:seed`",
    ...extra,
  };
}

export function isDbUnavailableError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("Environment variable not found: DATABASE_URL") ||
    msg.includes("DATABASE_URL") && msg.includes("not found") ||
    msg.includes("Can't reach database server") ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("P1001") ||
    msg.includes("Authentication failed") ||
    msg.includes("password authentication failed")
  );
}


