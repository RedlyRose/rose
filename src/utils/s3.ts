import { S3Client } from "@aws-sdk/client-s3";

export function getS3Client(env: any) {
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const endpoint = env.R2_ENDPOINT;

  if (!accessKeyId || !secretAccessKey || !endpoint) {
    return null;
  }

  return new S3Client({
    region: "auto",
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey,
    },
  });
}

export const R2_BUCKET_NAME = "media";
