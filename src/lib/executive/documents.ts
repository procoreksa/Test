import { prisma } from "@/lib/prisma";

/**
 * Document Health (Step 50) - deliberately lightweight: a count of active
 * documents, never storage internals (bytes on disk, provider health) and
 * never a vanity metric ("total downloads"). Just enough to flag an
 * org with zero documents on file, matching the brief's own "no storage
 * internals, no vanity metrics" instruction.
 */
export interface DocumentsSummary {
  activeDocuments: number;
}

export async function getDocumentsSummary(organizationId: string): Promise<DocumentsSummary> {
  const activeDocuments = await prisma.document.count({ where: { organizationId, status: "ACTIVE" } });
  return { activeDocuments };
}
