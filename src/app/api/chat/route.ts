import { NextResponse } from "next/server";
import { parseDemoCommand } from "@/lib/commands";
import { runTrustEye } from "@/lib/langgraph/graph";
import { dbUnavailablePayload, isDbUnavailableError } from "@/lib/dbUnavailable";
import { ConfigError } from "@/lib/errors";
import { generateContentRecommendations } from "@/lib/recommendations";
import { prisma } from "@/lib/db";
import { writeReceipt } from "@/lib/receipts";
import { getOrCreateSessionId } from "@/lib/session";
import { extractNeedsVerificationMarkers } from "@/lib/contentSafety";
import { getCustomerByDomain, getDomainFromRequest } from "@/lib/domain";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
    // Approve & Publish (non-streaming JSON)
    if (body?.action === "publish_asset") {
      const domain: string = body?.domain || getDomainFromRequest(req);
      const questionId: string | undefined = body?.questionId;
      const title: string = body?.title || "FAQ";
      const content: string = body?.content || "";
      const assetType: string = body?.assetType || "FAQ";
  
      if (!questionId) {
        return Response.json({ ok: false, error: "missing_questionId" }, { status: 400 });
      }
  
      const customer = await prisma.customer.findUnique({ where: { domain } });
      if (!customer) {
        return Response.json({ ok: false, error: "customer_not_found", domain }, { status: 404 });
      }
      const customerId = customer.id;

      // Safety switch: block publish when draft contains any NEEDS_VERIFICATION markers.
      const needsVerification = extractNeedsVerificationMarkers(content);
      if (needsVerification.length) {
        await writeReceipt({
          customerId,
          kind: "SUPPRESS",
          actor: "CONTENT_ENGINE",
          summary: "Publish blocked: draft contains NEEDS_VERIFICATION markers",
          input: { domain, questionId, assetType, title },
          output: { needsVerification },
        });
        return Response.json(
          { ok: false, error: "needs_verification", requiresApproval: true, missingClaims: needsVerification },
          { status: 400 }
        );
      }

      async function markQuestionAnswered() {
        const result = await prisma.question.updateMany({
          where: { id: questionId, customerId },
          data: { state: "ANSWERED" as any },
        });
        if (result.count > 0) {
          await writeReceipt({
            customerId,
            kind: "DECIDE",
            actor: "CONTENT_ENGINE",
            summary: "Question marked answered after publish",
            input: { questionId, domain },
            output: { state: "ANSWERED" },
          });
        }
        return result.count > 0;
      }
  
      // idempotent publish: if already published for same question+type, skip create
      const existing = await prisma.asset.findFirst({
        where: { customerId, questionId, type: assetType as any, status: "PUBLISHED" as any },
        select: { id: true, slug: true },
      });
  
      if (existing) {
        await writeReceipt({
          customerId,
          kind: "PUBLISH",
          actor: "CONTENT_ENGINE",
          summary: "Publish skipped (already published)",
          input: { domain, questionId, assetType, assetId: existing.id },
        });
  
        const answered = await markQuestionAnswered();

        return Response.json({
          ok: true,
          published: true,
          alreadyPublished: true,
          asset: { id: existing.id, slug: existing.slug },
          assetType,
          questionState: answered ? "ANSWERED" : undefined,
        });
      }
  
      const slugBase = (title || "faq")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60);
      const slug = `${slugBase || "faq"}-${questionId.slice(-6)}`;
  
      const asset = await prisma.asset.create({
        data: {
          customerId,
          questionId,
          type: assetType as any,
          status: "PUBLISHED" as any,
          title,
          slug,
          meta: { source: "recommendations_panel", placement: "/site/faq" },
          versions: { create: { version: 1, content } },
        },
        select: { id: true, slug: true },
      });
  
      await writeReceipt({
        customerId,
        kind: "PUBLISH",
        actor: "CONTENT_ENGINE",
        summary: "Approved and published FAQ asset",
        input: { domain, questionId, assetType, title, placement: "/site/faq" },
        output: { assetId: asset.id, slug: asset.slug },
      });
  
      const answered = await markQuestionAnswered();

      return Response.json({
        ok: true,
        published: true,
        alreadyPublished: false,
        asset: { id: asset.id, slug: asset.slug },
        assetType,
        questionState: answered ? "ANSWERED" : undefined,
      });
    }
  const message: string = body?.message ?? "";
  // Domain contract: prefer req.query.domain, then env fallback.
  const customerDomain: string = getDomainFromRequest(req) || body?.customerDomain;

  const command = parseDemoCommand(message);
  const sessionId = await getOrCreateSessionId();

  try {
    // Ensure the session exists before any downstream receipt writes reference it.
    const customer = await getCustomerByDomain(customerDomain).catch(() => null);
    if (!customer) {
      return NextResponse.json({ ok: false, error: "customer_not_found", domain: customerDomain }, { status: 404 });
    }
    await prisma.session.upsert({
      where: { id: sessionId },
      update: {},
      create: { id: sessionId, customerId: customer.id },
    });

    if (command === "recommend_content") {
      const recs = await generateContentRecommendations(customerDomain);
      return NextResponse.json({
        ok: true,
        customerDomain,
        command,
        overlays: [],
        steps: [],
        assistantMessage: `Generated ${recs.length} recommendations. Open Discovery → Recommended Content to review and approve.`,
        recommendations: recs.map((r) => ({
          id: r.id,
          kind: r.kind,
          title: r.title,
          targetUrl: r.targetUrl,
          status: r.status,
        })),
        debug: {},
      });
    }
    const result = await runTrustEye({
      customerDomain,
      command,
      userMessage: message,
      overlays: [],
      steps: [],
      assistantMessage: "",
      sessionId,
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
    if (err instanceof ConfigError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.code,
          message: err.message,
          customerDomain,
          command,
          overlays: [],
          steps: [],
          assistantMessage: err.message,
        },
        { status: 400 }
      );
    }
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
