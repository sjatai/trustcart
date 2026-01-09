export async function trackSiteEvent(type: string, data: Record<string, any>) {
  const res = await fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type,
      data,
    }),
  });
  if (!res.ok) throw new Error(`Event API failed: ${res.status}`);
  return res.json();
}


