import prisma from "../config/prisma.config.js";

/**
 * Write an audit log entry. Never throws — audit failures must not crash requests.
 * @param {{ actorId?: string, action: string, entityType: string, entityId: string, metadata?: object }} entry
 */
export async function writeAudit({ actorId, action, entityType, entityId, metadata }) {
  try {
    await prisma.auditLog.create({
      data: {
        actor_id: actorId ?? null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata: metadata ?? undefined,
      },
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err.message);
  }
}
