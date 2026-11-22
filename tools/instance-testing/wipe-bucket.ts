import { S3Client, ListObjectVersionsCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
const e = process.env;
const c = new S3Client({
  endpoint: e.S3_ENDPOINT,
  region: e.S3_REGION,
  forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
  credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! },
});
const Bucket = e.S3_BUCKET!;
if (Bucket !== "nookly-files") throw new Error("refusing: bucket is " + Bucket);
let total = 0,
  versions = 0,
  markers = 0;
for (;;) {
  const r = await c.send(new ListObjectVersionsCommand({ Bucket, MaxKeys: 1000 }));
  const objs = [
    ...(r.Versions ?? []).map((v) => ({ Key: v.Key!, VersionId: v.VersionId })),
    ...(r.DeleteMarkers ?? []).map((v) => ({ Key: v.Key!, VersionId: v.VersionId })),
  ];
  versions += r.Versions?.length ?? 0;
  markers += r.DeleteMarkers?.length ?? 0;
  if (!objs.length) break;
  await c.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objs, Quiet: true } }));
  total += objs.length;
  if (!r.IsTruncated) break;
}
console.log(JSON.stringify({ bucket: Bucket, deleted: total, versions, markers }));
