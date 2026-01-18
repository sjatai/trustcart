import path from "path";
import fs from "fs/promises";

function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function GET(_: Request, ctx: { params: { path: string[] } }) {
  const baseDir = path.join(process.cwd(), "demo_sunnystep");

  const rel = (ctx.params.path || []).join("/");
  const normalized = rel.replace(/^\/+/, "");
  const abs = path.resolve(baseDir, normalized);

  if (!abs.startsWith(baseDir)) {
    return new Response("Invalid path", { status: 400 });
  }

  try {
    const buf = await fs.readFile(abs);
    const ext = path.extname(abs);
    return new Response(buf, {
      headers: {
        "Content-Type": contentTypeForExt(ext),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}

