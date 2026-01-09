import { MissionControlClient } from "@/app/mission-control/MissionControlClient";

export default function MissionControlPage({
  searchParams,
}: {
  searchParams?: { presentation?: string };
}) {
  const initialPresentation = searchParams?.presentation === "true";
  return <MissionControlClient initialPresentation={initialPresentation} />;
}
