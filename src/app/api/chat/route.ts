import { NextResponse } from "next/server";
import { parseDemoCommand } from "@/lib/commands";
import { runTrustEye } from "@/lib/langgraph/graph";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message: string = body?.message ?? "";
  const customerDomain: string = body?.customerDomain ?? process.env.NEXT_PUBLIC_DEMO_DOMAIN ?? "reliablenissan.com";

  const command = parseDemoCommand(message);

  try {
    const result = await runTrustEye({
      customerDomain,
      command,
      userMessage: message,
      overlays: [],
      steps: [],
      assistantMessage: "",
    });

    return NextResponse.json({
      ok: true,
      customerDomain,
      command,
      overlays: result.overlays ?? [],
      steps: result.steps ?? [],
      assistantMessage: result.assistantMessage ?? "",
      debug: result.debug ?? {},
    });
  } catch (err) {
    if (isDbUnavailableError(err)) {
      return NextResponse.json(dbUnavailablePayload({ route: "/api/chat" }));
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        ok: false,
        error: "server_error",
        message: msg,
        customerDomain,
        command,
        overlays: [],
        steps: [],
        assistantMessage: "Internal error while running agents. Check server logs.",
      },
      { status: 500 }
    );
  }
}
