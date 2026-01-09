export function colorForState(state: string) {
  if (state === "TRUSTED") return "#12B76A"; // green
  if (state === "ANSWERED") return "#1B62F8"; // blue
  if (state === "WEAK") return "#F2C94C"; // yellow
  if (state === "STALE") return "#E5E7EB"; // light gray
  return "#D0D5DD"; // muted gray (unanswered)
}


