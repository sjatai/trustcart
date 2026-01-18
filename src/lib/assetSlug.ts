export function buildAssetSlug(title: string, questionId: string) {
  const slugBase = (title || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
  return `${slugBase || "asset"}-${questionId.slice(-6)}`;
}
