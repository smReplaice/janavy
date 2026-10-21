/** S3 connectivity + janavi-scoped read/write roundtrip. Run: node --env-file=.env scripts/janavi/s3probe.mjs */
import { S3Client, HeadBucketCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
const client = new S3Client({ region: process.env.NEXT_PRIVATE_UPLOAD_REGION, credentials: { accessKeyId: process.env.NEXT_PRIVATE_UPLOAD_ACCESS_KEY_ID, secretAccessKey: process.env.NEXT_PRIVATE_UPLOAD_SECRET_ACCESS_KEY } });
const bucket = process.env.NEXT_PRIVATE_UPLOAD_BUCKET;
try { await client.send(new HeadBucketCommand({ Bucket: bucket })); console.log("S3 HEAD: OK", bucket); } catch (e) { console.log("S3 HEAD FAILED:", e.name, e.message?.slice(0, 140)); }
const key = "janavi-qa/probe.txt";
try {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "janavi probe", ContentType: "text/plain" }));
  const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await got.Body.transformToString();
  console.log("S3 ROUNDTRIP:", body === "janavi probe" ? "OK" : "MISMATCH");
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log("S3 CLEANUP: OK");
} catch (e) { console.log("S3 RW FAILED:", e.name, e.message?.slice(0, 140)); }
