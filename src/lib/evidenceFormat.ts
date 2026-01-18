export function formatEvidenceForUI(e: { url: string; snippet?: string | null }) {
  try {
    const u = new URL(e.url);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname === "/" ? "" : u.pathname;

    return {
      href: e.url,
      label: `${host}${path}`.slice(0, 60),
      excerpt: cleanSnippet(e.snippet),
    };
  } catch {
    return {
      href: e.url,
      label: e.url.slice(0, 60),
      excerpt: cleanSnippet(e.snippet),
    };
  }
}

export function cleanSnippet(snippet?: string | null) {
  if (!snippet) return null;
  return snippet
    .replace(/Skip to main content/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}



