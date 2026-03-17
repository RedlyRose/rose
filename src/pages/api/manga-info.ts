import type { APIRoute } from 'astro';
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const title = formData.get('title') as string || '';
    const url = formData.get('url') as string || '';
    const cover = formData.get('cover') as string || '';
    const file = formData.get('file') as File | null;
    const tags = formData.get('tags') as string || '';
    const artist = formData.get('artist') as string || '';

    const runtime = (locals as any).runtime;
    const db = runtime?.env?.DB || (locals as any).DB || (globalThis as any).DB;
    const nativeBucket = runtime?.env?.BUCKET || (locals as any).BUCKET;
    const s3Config = getS3Config(locals);
    const s3 = getS3Client(s3Config);

    const nhentaiMatch = url.match(/\/g\/(\d+)/);
    const nhentaiId = nhentaiMatch ? nhentaiMatch[1] : null;

    let finalTitle = title;
    let finalUrl = url;
    let finalCoverUrl = cover;

    if (nhentaiId && !file) {
      if (!finalTitle) finalTitle = `nHentai #${nhentaiId}`;
      if (!finalCoverUrl) {
        const mediaId = nhentaiId === '637496' ? '3105436' : (parseInt(nhentaiId) - 4000).toString();
        finalCoverUrl = `https://wsrv.nl/?url=https://i.nhentai.net/galleries/${mediaId}/1.webp&w=400&output=webp`;
      }
      if (!finalUrl.includes('nhentai.net')) {
        finalUrl = `https://nhentai.net/g/${nhentaiId}/`;
      }
    }

    if (!finalTitle) finalTitle = "Private Entry";

    let r2LocalPath = finalCoverUrl;

    // Helper to upload to R2 (tries native then S3)
    const uploadToR2 = async (key: string, body: Uint8Array, contentType: string) => {
      if (nativeBucket) {
        await nativeBucket.put(key, body, { httpMetadata: { contentType } });
        return true;
      } else if (s3) {
        const command = new PutObjectCommand({
          Bucket: s3Config.bucket,
          Key: key,
          Body: body,
          ContentType: contentType
        });
        await s3.send(command);
        return true;
      }
      return false;
    };

    if (file) {
      const fileName = `covers/manga/upload-${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      const buffer = await file.arrayBuffer();
      const success = await uploadToR2(fileName, new Uint8Array(buffer), file.type || 'image/webp');
      if (success) r2LocalPath = `/api/content/${fileName}`;
    } 
    else if (finalCoverUrl && finalCoverUrl.startsWith('http')) {
      try {
        const imgRes = await fetch(finalCoverUrl);
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/webp';
          const fileName = nhentaiId 
            ? `covers/manga/${nhentaiId}.webp` 
            : `covers/manga/fetch-${Date.now()}.webp`;
          
          const buffer = await imgRes.arrayBuffer();
          const success = await uploadToR2(fileName, new Uint8Array(buffer), contentType);
          if (success) r2LocalPath = `/api/content/${fileName}`;
        }
      } catch (err) {
        console.error('R2 Proxy Fetch Error:', err);
      }
    }

    if (!r2LocalPath) {
      r2LocalPath = 'https://via.placeholder.com/300x450/111/9d4edd?text=VaultHUB';
    }

    if (db) {
      await db.prepare(`
        INSERT INTO manga (nhentai_id, title, source_url, cover_url, tags, artist) 
        VALUES (?, ?, ?, ?, ?, ?) 
        ON CONFLICT(nhentai_id) DO UPDATE SET 
          title = COALESCE(excluded.title, title),
          source_url = COALESCE(excluded.source_url, source_url),
          cover_url = excluded.cover_url,
          tags = COALESCE(excluded.tags, tags),
          artist = COALESCE(excluded.artist, artist)
      `).bind(nhentaiId, finalTitle, finalUrl, r2LocalPath, tags, artist).run();
    }

    return new Response(JSON.stringify({
      title: finalTitle,
      url: finalUrl,
      localCover: r2LocalPath,
      nhentaiId: nhentaiId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error('API Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { id, nhentaiId } = await request.json();
    const runtime = (locals as any).runtime;
    const db = runtime?.env?.DB || (locals as any).DB || (globalThis as any).DB;

    if (db) {
      if (id) {
        await db.prepare('DELETE FROM manga WHERE id = ?').bind(id).run();
      } else if (nhentaiId) {
        await db.prepare('DELETE FROM manga WHERE nhentai_id = ?').bind(nhentaiId).run();
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const PATCH: APIRoute = async ({ request, locals }) => {
  try {
    const { id, nhentaiId, title, source_url, tags, artist, favorite_status } = await request.json();
    const runtime = (locals as any).runtime;
    const db = runtime?.env?.DB || (locals as any).DB || (globalThis as any).DB;

    if (db) {
      let query = 'UPDATE manga SET ';
      const params = [];
      const fields = [];

      if (title !== undefined) { fields.push('title = ?'); params.push(title); }
      if (source_url !== undefined) { fields.push('source_url = ?'); params.push(source_url); }
      if (tags !== undefined) { fields.push('tags = ?'); params.push(tags); }
      if (artist !== undefined) { fields.push('artist = ?'); params.push(artist); }
      if (favorite_status !== undefined) { fields.push('favorite_status = ?'); params.push(favorite_status); }

      if (fields.length === 0) return new Response('No fields to update', { status: 400 });

      query += fields.join(', ');
      
      if (id) {
        query += ' WHERE id = ?';
        params.push(id);
      } else if (nhentaiId) {
        query += ' WHERE nhentai_id = ?';
        params.push(nhentaiId);
      } else {
        return new Response('Missing identifier', { status: 400 });
      }

      await db.prepare(query).bind(...params).run();
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
