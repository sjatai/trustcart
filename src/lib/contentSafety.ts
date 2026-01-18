export function extractNeedsVerificationMarkers(content: string): string[] {
  const text = String(content || "");
  const items: string[] = [];

  // Bracket marker: [NEEDS_VERIFICATION: ask for X]
  const re = /\[\s*NEEDS_VERIFICATION\s*:\s*([^\]]+?)\s*\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const note = String(m[1] || "").trim();
    if (note) items.push(note);
  }

  // Bare marker: NEEDS_VERIFICATION
  if (/NEEDS_VERIFICATION/i.test(text) && items.length === 0) {
    items.push("NEEDS_VERIFICATION");
  }

  return Array.from(new Set(items));
}

export function hasNeedsVerification(content: string): boolean {
  return extractNeedsVerificationMarkers(content).length > 0;
}

