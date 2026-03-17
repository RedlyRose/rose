import type { APIRoute } from 'astro';
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const getS3Config = (locals: any) => {
  const env = locals.runtime?.env || (globalThis as any).process?.env || {};
  return {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    endpoint: env.R2_ENDPOINT,
    bucket: env.R2_BUCKET_NAME || 'media'
  };
};

const getS3Client = (config: any) => {
  if (!config.accessKeyId || !config.secretAccessKey || !config.endpoint) return null;
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
};

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const fileName = params.file;
    if (!fileName) return new Response('Source filename missing', { status: 400 });

    // 1. Try Native R2 Binding
    const nativeBucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;
    if (nativeBucket) {
      const object = await nativeBucket.get(fileName);
      if (object) {
        const headers = new Headers();
        try { object.writeHttpMetadata(headers); } catch (e) {}
        headers.set('etag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable'); 
        return new Response(object.body, { headers });
      }
    }

    // 2. Fallback to S3 Client
    const config = getS3Config(locals);
    const s3 = getS3Client(config);
    if (!s3) return new Response('R2 binding and S3 config missing', { status: 500 });

    const command = new GetObjectCommand({
      Bucket: config.bucket,
      Key: fileName
    });

    const response = await s3.send(command);
    if (!response.Body) return new Response('File not found', { status: 404 });

    const headers = new Headers();
    headers.set('Content-Type', response.ContentType || 'application/octet-stream');
    headers.set('Content-Length', response.ContentLength?.toString() || '');
    headers.set('ETag', response.ETag || '');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    // Convert S3 Body (Readable) to standard Web Response body
    return new Response(response.Body as any, { headers });

  } catch (err: any) {
    return new Response(`[VaultHUB R2 Error]: ${err.message}`, { status: 500 });
  }
};
