import type { SQLiteDatabase } from "expo-sqlite";
import { Directory, File, Paths } from "expo-file-system";

/// The folder backups made before a first sync go to, in the app's documents.
export const BACKUP_FOLDER = "pre-sync-backups";
const SQLITE_HEADER = "SQLite format 3";

/// A full copy of the phone's database, made before a first sync sends anything,
/// and read back to check it is a real database. The newest three stay.
export async function backUpBeforeSync(db: SQLiteDatabase): Promise<{ path: string }> {
  const bytes = await db.serializeAsync();
  if (bytes.length === 0) throw new Error("The database came out empty.");
  const folder = new Directory(Paths.document, BACKUP_FOLDER);
  folder.create({ intermediates: true, idempotent: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const partial = new File(folder, `.nookly-${stamp}.partial`);
  partial.create({ overwrite: true });
  partial.write(bytes);
  const header = new TextDecoder().decode(
    (await partial.bytes()).subarray(0, SQLITE_HEADER.length),
  );
  if (header !== SQLITE_HEADER || partial.size !== bytes.length) {
    partial.delete();
    throw new Error("The backup didn't read back correctly.");
  }
  const target = new File(folder, `nookly-${stamp}.db`);
  partial.move(target);
  const old = folder
    .list()
    .filter((entry): entry is File => entry instanceof File && entry.name.endsWith(".db"))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const file of old.slice(0, Math.max(0, old.length - 3))) file.delete();
  return { path: target.uri };
}
