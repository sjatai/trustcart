export async function sendMissionControlMessage(message: string, customerDomain?: string) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, customerDomain }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    return {
      ok: false,
      assistantMessage:
        json?.error === "db_unavailable"
          ? "Database is not running yet. Start Docker Desktop, run `docker compose up -d`, then run `npm run prisma:migrate` and `npm run prisma:seed`."
          : `Chat API error. (${res.status || "unknown"})`,
      steps: [],
      overlays: [],
      debug: json,
    };
  }
  return json;
}
