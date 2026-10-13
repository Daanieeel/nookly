import { SHAREABLE_TYPES, type Share, type ShareRole } from "@nookly/shared/api";
import { and, eq, inArray, or } from "drizzle-orm";
import { hashToken, randomToken } from "../auth/tokens.ts";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { shares, users } from "../db/schema.ts";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../errors.ts";
import type { Logger } from "../log.ts";
import type { Mailer } from "../mail/mailer.ts";
import type { Hub } from "../sync/hub.ts";
import type { SyncService } from "../sync/service.ts";

type ShareRow = typeof shares.$inferSelect;

/// Sharing an entity with someone by email: an invite they accept or decline, a role
/// (viewer or editor) the owner can change, and revoking. Accepting adds the share as
/// a dataset the recipient's devices sync.
export class ShareService {
  private readonly db: Database;
  private readonly sync: SyncService;
  private readonly hub: Hub;
  private readonly mailer: Mailer;
  private readonly config: Config;
  private readonly log: Logger;

  constructor(
    db: Database,
    sync: SyncService,
    hub: Hub,
    mailer: Mailer,
    config: Config,
    log: Logger,
  ) {
    this.db = db;
    this.sync = sync;
    this.hub = hub;
    this.mailer = mailer;
    this.config = config;
    this.log = log;
  }

  private async view(row: ShareRow): Promise<Share> {
    const [owner] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, row.ownerId));
    const entity = await this.sync.entity(row.ownerId, row.entityId);
    return {
      id: row.id,
      entityId: row.entityId,
      entityType: row.entityType,
      title: entity?.title ?? "",
      role: row.role,
      status: row.status,
      ownerEmail: owner?.email ?? "",
      recipientEmail: row.recipientEmail,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private changed(row: ShareRow) {
    if (row.recipientId) this.hub.notify(row.recipientId, { type: "datasets" });
    this.hub.notify(row.ownerId, { type: "datasets" });
  }

  async create(ownerId: string, entityId: string, email: string, role: ShareRole) {
    const [owner] = await this.db.select().from(users).where(eq(users.id, ownerId));
    if (!owner) throw forbidden();
    if (!owner.emailVerifiedAt) {
      throw new HttpError(403, "email_unverified", "Confirm your email address before sharing.");
    }
    if (owner.email === email)
      throw badRequest("share_with_self", "This is your own email address.");
    const entity = await this.sync.entity(ownerId, entityId);
    if (!entity) throw notFound("This item hasn't synced yet. Sync, then share it.");
    if (!SHAREABLE_TYPES.some((type) => type === entity.type)) {
      throw badRequest("not_shareable", "This kind of item can't be shared yet.");
    }
    const [recipient] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    const token = randomToken();
    const [row] = await this.db
      .insert(shares)
      .values({
        ownerId,
        entityId,
        entityType: entity.type,
        recipientEmail: email,
        recipientId: recipient?.id ?? null,
        role,
        status: "pending",
        inviteTokenHash: hashToken(token),
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict("already_shared", "This is already shared with that address.");
    const inviteUrl = `${this.config.PUBLIC_URL.replace(/\/$/, "")}/invite?token=${encodeURIComponent(token)}`;
    await this.mailer
      .send({
        to: email,
        subject: `${owner.email} shared "${entity.title || "Untitled"}" with you`,
        text: `${owner.email} shared "${entity.title || "Untitled"}" with you in Nookly, to ${role === "editor" ? "edit" : "view"}.\n\nSign in to Nookly with ${email} to accept it, or open:\n\n${inviteUrl}`,
      })
      .catch((error: Error) =>
        this.log.error("couldn't send the invite email", { error: error.message }),
      );
    this.changed(row);
    return { share: await this.view(row), inviteUrl };
  }

  async outgoing(ownerId: string): Promise<Share[]> {
    const rows = await this.db
      .select()
      .from(shares)
      .where(and(eq(shares.ownerId, ownerId), inArray(shares.status, ["pending", "accepted"])))
      .orderBy(shares.createdAt);
    return Promise.all(rows.map((r) => this.view(r)));
  }

  async incoming(userId: string): Promise<Share[]> {
    const [me] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!me) return [];
    const rows = await this.db
      .select()
      .from(shares)
      .where(
        and(
          or(eq(shares.recipientId, userId), eq(shares.recipientEmail, me.email)),
          inArray(shares.status, ["pending", "accepted"]),
        ),
      )
      .orderBy(shares.createdAt);
    return Promise.all(rows.map((r) => this.view(r)));
  }

  /// The share, if it was sent to this account.
  private async received(userId: string, shareId: string): Promise<ShareRow> {
    const [me] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    const [row] = await this.db.select().from(shares).where(eq(shares.id, shareId));
    if (!row || !me || (row.recipientId !== userId && row.recipientEmail !== me.email))
      throw notFound("No such share.");
    return row;
  }

  async respond(userId: string, shareId: string, accept: boolean) {
    const row = await this.received(userId, shareId);
    if (row.status !== "pending")
      throw conflict("not_pending", "This invite was already answered.");
    const [updated] = await this.db
      .update(shares)
      .set({
        status: accept ? "accepted" : "declined",
        recipientId: userId,
        respondedAt: new Date(),
      })
      .where(eq(shares.id, row.id))
      .returning();
    this.changed(updated);
  }

  async acceptInvite(userId: string, token: string) {
    const [row] = await this.db
      .select()
      .from(shares)
      .where(eq(shares.inviteTokenHash, hashToken(token)));
    if (!row || row.status !== "pending") {
      throw new HttpError(400, "invalid_token", "This invite has expired or was already answered.");
    }
    const [me] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    // The link only works for the address it was sent to.
    if (!me || me.email !== row.recipientEmail) throw notFound("No such share.");
    await this.respond(userId, row.id, true);
  }

  async changeRole(ownerId: string, shareId: string, role: ShareRole) {
    const [row] = await this.db
      .update(shares)
      .set({ role })
      .where(
        and(
          eq(shares.id, shareId),
          eq(shares.ownerId, ownerId),
          inArray(shares.status, ["pending", "accepted"]),
        ),
      )
      .returning();
    if (!row) throw notFound("No such share.");
    this.changed(row);
  }

  /// The owner revokes, the recipient leaves. Either way the recipient's devices drop
  /// their copy on their next sync.
  async remove(userId: string, shareId: string) {
    const [row] = await this.db.select().from(shares).where(eq(shares.id, shareId));
    if (!row) throw notFound("No such share.");
    let status: "revoked" | "declined";
    if (row.ownerId === userId) status = "revoked";
    else {
      await this.received(userId, shareId);
      status = "declined";
    }
    const [updated] = await this.db
      .update(shares)
      .set({ status, respondedAt: new Date() })
      .where(eq(shares.id, row.id))
      .returning();
    this.changed(updated);
  }
}
