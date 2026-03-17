import type { APIRoute } from 'astro';
import { ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix') || '';
    
    // 1. Try Native R2 Binding first
    const nativeBucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;
    
    if (nativeBucket) {
      const list = await nativeBucket.list({ prefix, delimiter: '/' });
      return new Response(JSON.stringify({
        success: true,
        source: 'native',
        files: (list.objects || []).map((obj: any) => ({
          key: obj.key,
          size: obj.size,
          uploaded: obj.uploaded,
          url: `/api/content/${obj.key}`
        })),
        folders: (list.commonPrefixes || []).map((p: string) => p)
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Fallback to S3 Client
    const config = getS3Config(locals);
    const s3 = getS3Client(config);

    if (!s3) {
      return new Response(JSON.stringify({ 
        error: "No R2 bucket binding or S3 configuration found.",
        diagnostics: { hasLocalsRuntime: !!locals.runtime, hasS3Config: !!config.accessKeyId }
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const command = new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: prefix,
      Delimiter: '/'
    });

    const response = await s3.send(command);
    
    return new Response(JSON.stringify({
      success: true,
      source: 's3',
      files: (response.Contents || []).map((obj: any) => ({
        key: obj.Key,
        size: obj.Size,
        uploaded: obj.LastModified,
        url: `/api/content/${obj.Key}`
      })),
      folders: (response.CommonPrefixes || []).map((p: any) => p.Prefix)
    }), { headers: { 'Content-Type': 'application/json' } });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string || '';
    if (!file) return new Response('No file provided', { status: 400 });

    const fileName = path ? `${path}/${file.name}` : file.name;
    const buffer = await file.arrayBuffer();

    // 1. Try Native
    const nativeBucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;
    if (nativeBucket) {
      await nativeBucket.put(fileName, buffer, {
        httpMetadata: { contentType: file.type || 'application/octet-stream' }
      });
      return new Response(JSON.stringify({ success: true, key: fileName, source: 'native' }));
    }

    // 2. Try S3
    const config = getS3Config(locals);
    const s3 = getS3Client(config);
    if (!s3) throw new Error("No R2 access method available");

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: fileName,
      Body: new Uint8Array(buffer),
      ContentType: file.type || 'application/octet-stream'
    });

    await s3.send(command);
    return new Response(JSON.stringify({ success: true, key: fileName, source: 's3' }));

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { key } = await request.json();
    if (!key) return new Response('Missing key', { status: 400 });

    // 1. Try Native
    const nativeBucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;
    if (nativeBucket) {
      await nativeBucket.delete(key);
      return new Response(JSON.stringify({ success: true, source: 'native' }));
    }

    // 2. Try S3
    const config = getS3Config(locals);
    const s3 = getS3Client(config);
    if (!s3) throw new Error("No R2 access method available");

    const command = new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key
    });

    await s3.send(command);
    return new Response(JSON.stringify({ success: true, source: 's3' }));

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
