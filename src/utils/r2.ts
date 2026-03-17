import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

export async function getR2Content(runtime: any) {
  try {
    // 1. Try Native
    const bucket = runtime?.env?.BUCKET || runtime?.BUCKET;
    if (bucket) {
      const list = await bucket.list();
      return (list.objects || []).map((obj: any) => ({
        key: obj.key,
        url: `/api/content/${obj.key}`
      }));
    }

    // 2. Try S3 Fallback
    const env = runtime?.env || (globalThis as any).process?.env || {};
    const accessKeyId = env.R2_ACCESS_KEY_ID;
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
    const endpoint = env.R2_ENDPOINT;
    const bucketName = env.R2_BUCKET_NAME || 'media';

    if (accessKeyId && secretAccessKey && endpoint) {
      const s3 = new S3Client({
        region: "auto",
        endpoint: endpoint,
        credentials: {
          accessKeyId: accessKeyId,
          secretAccessKey: secretAccessKey,
        },
      });

      const command = new ListObjectsV2Command({
        Bucket: bucketName
      });

      const response = await s3.send(command);
      return (response.Contents || []).map((obj: any) => ({
        key: obj.Key,
        url: `/api/content/${obj.Key}`
      }));
    }
  } catch (error) {
    console.error('Error listing R2 content (native or S3):', error);
  }

  return [];
}
