import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const COOKIE_NAME = "trusteye_session";

export async function getOrCreateSessionId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing) return existing;
  const id = randomUUID();
  jar.set(COOKIE_NAME, id, { httpOnly: true, sameSite: "lax", path: "/" });
  return id;
}
