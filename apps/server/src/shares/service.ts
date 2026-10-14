import { SHAREABLE_TYPES, type Share, type ShareRole } from "@nookly/shared/api";
import { type SQL, and, eq, inArray, or } from "drizzle-orm";
import { isPlaceholderEmail } from "../auth/auth.ts";
import { hashToken, randomToken } from "../security/tokens.ts";
import type { Config } from "../config.ts";
import type { Database } from "../db/client.ts";
import { authUser, shares } from "../db/schema.ts";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../errors.ts";
import type { Logger } from "../log.ts";
import type { Mailer } from "../mail/mailer.ts";
import type { Hub } from "../sync/hub.ts";
import type { SyncService } from "../sync/service.ts";

type ShareRow = typeof shares.$inferSelect;

/// Who an account is to sharing: its username, and its email once it is confirmed.
interface Identity {
  id: string;
  username: string;
  verifiedEmail: string | null;
}

/// Sharing an entity with someone by username or email: an invite they accept or decline, a role
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

  private async identity(where: SQL | undefined): Promise<Identity | null> {
    const [row] = await this.db.select().from(authUser).where(where);
    if (!row) return null;
    const real = !isPlaceholderEmail(row.email) && row.emailVerified;
    return {
      id: row.id,
      username: row.username ?? row.name,
      verifiedEmail: real ? row.email : null,
    };
  }

  private async view(row: ShareRow): Promise<Share> {
    const owner = await this.identity(eq(authUser.id, row.ownerId));
    const entity = await this.sync.entity(row.ownerId, row.entityId);
    return {
      id: row.id,
      entityId: row.entityId,
      entityType: row.entityType,
      title: entity?.title ?? "",
      role: row.role,
      status: row.status,
      owner: owner?.username ?? "",
      recipient: row.recipientEmail,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private changed(row: ShareRow) {
    if (row.recipientId) this.hub.notify(row.recipientId, { type: "datasets" });
    this.hub.notify(row.ownerId, { type: "datasets" });
  }

  /// Shares with an account by its username, or invites an email address, which
  /// may not have an account yet. An email invite needs the owner's own confirmed
  /// email, so nobody can send mail from an address they don't hold.
  async create(ownerId: string, entityId: string, recipient: string, role: ShareRole) {
    const owner = await this.identity(eq(authUser.id, ownerId));
    if (!owner) throw forbidden();
    const byEmail = recipient.includes("@");
    if (recipient === owner.username || recipient === owner.verifiedEmail)
      throw badRequest("share_with_self", "That is you.");
    if (byEmail && !owner.verifiedEmail) {
      throw new HttpError(
        403,
        "email_unverified",
        "Confirm your own email address before inviting by email, or share by username.",
      );
    }
    const entity = await this.sync.entity(ownerId, entityId);
    if (!entity) throw notFound("This item hasn't synced yet. Sync, then share it.");
    if (!SHAREABLE_TYPES.some((type) => type === entity.type)) {
      throw badRequest("not_shareable", "This kind of item can't be shared yet.");
    }
    const target = byEmail
      ? await this.identity(and(eq(authUser.email, recipient), eq(authUser.emailVerified, true)))
      : await this.identity(eq(authUser.username, recipient));
    if (!byEmail && !target) throw notFound("No one has that username.");
    if (target?.id === ownerId) throw badRequest("share_with_self", "That is you.");
    const token = randomToken();
    const [row] = await this.db
      .insert(shares)
      .values({
        ownerId,
        entityId,
        entityType: entity.type,
        recipientEmail: recipient,
        recipientId: target?.id ?? null,
        role,
        status: "pending",
        inviteTokenHash: hashToken(token),
      })
      .onConflictDoNothing()
      .returning();
    if (!row) throw conflict("already_shared", "This is already shared with them.");
    const inviteUrl = `${this.config.PUBLIC_URL.replace(/\/$/, "")}/invite?token=${encodeURIComponent(token)}`;
    if (byEmail) {
      const title = entity.title || "Untitled";
      await this.mailer
        .send({
          to: recipient,
          subject: `${owner.username} shared "${title}" with you`,
          text: `${owner.username} shared "${title}" with you in Nookly, to ${role === "editor" ? "edit" : "view"}.\n\nSign in to Nookly with an account that has ${recipient} as its confirmed email to accept it, or open:\n\n${inviteUrl}`,
        })
        .catch((error: Error) =>
          this.log.error("couldn't send the invite email", { error: error.message }),
        );
    }
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

  /// Where an account's invites may be: to its id, or to its confirmed email.
  private addressedTo(me: Identity) {
    const byId = eq(shares.recipientId, me.id);
    return me.verifiedEmail
      ? (or(byId, eq(shares.recipientEmail, me.verifiedEmail)) ?? byId)
      : byId;
  }

  async incoming(userId: string): Promise<Share[]> {
    const me = await this.identity(eq(authUser.id, userId));
    if (!me) return [];
    const rows = await this.db
      .select()
      .from(shares)
      .where(and(this.addressedTo(me), inArray(shares.status, ["pending", "accepted"])))
      .orderBy(shares.createdAt);
    return Promise.all(rows.map((r) => this.view(r)));
  }

  /// The share, if it was sent to this account.
  private async received(userId: string, shareId: string): Promise<ShareRow> {
    const me = await this.identity(eq(authUser.id, userId));
    const [row] = await this.db.select().from(shares).where(eq(shares.id, shareId));
    const mine =
      row && me && (row.recipientId === userId || row.recipientEmail === me.verifiedEmail);
    if (!row || !mine) throw notFound("No such share.");
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
    const me = await this.identity(eq(authUser.id, userId));
    // The link only works for the account or confirmed address it was sent to.
    if (!me || (row.recipientId !== userId && row.recipientEmail !== me.verifiedEmail))
      throw notFound("No such share.");
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
