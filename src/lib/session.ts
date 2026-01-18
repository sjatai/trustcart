import { cookies } from "next/headers";
import { randomUUID } from "crypto";

const COOKIE_NAME = "trusteye_session";

export async function getOrCreateSessionId(): Promise<string> {
  // During build-time analysis or other contexts without request async storage,
  // `cookies()` can throw. Fall back to an ephemeral session id in those cases.
  try {
    const jar = cookies();
    const existing = jar.get(COOKIE_NAME)?.value;
    if (existing) return existing;
    const id = randomUUID();
    jar.set(COOKIE_NAME, id, { httpOnly: true, sameSite: "lax", path: "/" });
    return id;
  } catch {
    return randomUUID();
  }
}
