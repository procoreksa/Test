import { NextResponse } from "next/server";
import type { UserRole } from "@prisma/client";
import { auth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { streamDocumentVersion } from "@/lib/documents/download";

/**
 * Internal staff download/preview route (Step 35). Not covered by
 * src/proxy.ts's middleware (all `/api/*` routes are excluded there - see
 * docs/DOCUMENT-MANAGEMENT.md, "Download route auth"), so authentication
 * and authorization happen entirely inside this handler, on every single
 * request - the document id in the URL is never trusted as authorization
 * on its own (Critical Principle 3). Historical versions are reachable
 * here (via `?versionId=`) for staff holding `document.download`; Tenant/
 * Owner Portal routes below never accept that parameter at all.
 */
export async function GET(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!can("document.download", session.user.role as UserRole)) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const { documentId } = await params;
  const organizationId = session.user.organizationId;

  const document = await prisma.document.findFirst({ where: { id: documentId, organizationId } });
  if (!document) return new Response("Not Found", { status: 404 });

  const url = new URL(req.url);
  const requestedVersionId = url.searchParams.get("versionId");
  const inlinePreferred = url.searchParams.get("mode") === "inline";

  return streamDocumentVersion({
    organizationId,
    document,
    requestedVersionId,
    principalType: "INTERNAL",
    principalId: session.user.id,
    principalEmail: session.user.email,
    inlinePreferred,
  });
}
