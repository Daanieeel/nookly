import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const e = process.env;
const c = new S3Client({
  endpoint: e.S3_ENDPOINT,
  region: e.S3_REGION,
  forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
});
const Bucket = e.S3_BUCKET!;
// SAFETY: the manifest is the file seed.ts wrote, with exactly these fields.
const manifest = JSON.parse(readFileSync(process.argv[2], "utf8")).files as {
  title: string;
  sha256: string;
  bytes: number;
}[];
const keys: { Key: string; Size: number }[] = [];
let tok: string | undefined;
do {
  const r = await c.send(new ListObjectsV2Command({ Bucket, ContinuationToken: tok }));
  keys.push(...(r.Contents ?? []).map((o) => ({ Key: o.Key!, Size: o.Size! })));
  tok = r.NextContinuationToken;
} while (tok);
const want = new Set(manifest.map((m) => m.sha256));
let ok = 0,
  bad: string[] = [];
const seenSha = new Set<string>();
for (const k of keys) {
  const r = await c.send(new GetObjectCommand({ Bucket, Key: k.Key }));
  const buf = Buffer.from(await r.Body!.transformToByteArray());
  const sha = createHash("sha256").update(buf).digest("hex");
  seenSha.add(sha);
  if (!k.Key.includes(sha)) bad.push(`key ${k.Key} content sha ${sha.slice(0, 12)} mismatch`);
}
const missing = [...want].filter((s) => !seenSha.has(s));
const extra = [...seenSha].filter((s) => !want.has(s));
console.log(
  JSON.stringify({
    bucketObjects: keys.length,
    distinctManifestHashes: want.size,
    missingFromBucket: missing.length,
    extraInBucket: extra.length,
    keyContentMismatch: bad.length,
    bytes: keys.reduce((a, k) => a + k.Size, 0),
    sampleKey: keys[0]?.Key,
  }),
);
