export async function sendMissionControlMessage(message: string, customerDomain?: string) {
  try {
    const qp = customerDomain ? `?domain=${encodeURIComponent(customerDomain)}` : "";
    const res = await fetch(`/api/chat${qp}`, {
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
            ? "Database is not reachable. Ensure `DATABASE_URL` is set, start Docker Desktop, run `docker compose up -d`, then run `npm run prisma:migrate` and `npm run prisma:seed`."
            : `Chat API error. (${res.status || "unknown"})`,
        steps: [],
        overlays: [],
        debug: json,
      };
    }
    return json;
  } catch (err: any) {
    const msg = String(err?.message || err || "Failed to fetch");
    return {
      ok: false,
      assistantMessage:
        "Mission Control couldn’t reach `/api/chat` (network/server restart). Check that `npm run dev` is running and no endpoint is in a request loop.",
      steps: [],
      overlays: [],
      debug: { error: "fetch_failed", message: msg },
    };
  }
}
