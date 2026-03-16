import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const title = formData.get('title') as string || '';
    const url = formData.get('url') as string || '';
    const cover = formData.get('cover') as string || '';
    const file = formData.get('file') as File | null;
    const tags = formData.get('tags') as string || '';
    const artist = formData.get('artist') as string || '';

    const env = locals.runtime?.env;
    const db = env?.DB;
    const bucket = env?.BUCKET;

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

    if (file && bucket) {
      const fileName = `covers/manga/upload-${Date.now()}-${file.name.replace(/\s+/g, '_')}`;
      const buffer = await file.arrayBuffer();
      await bucket.put(fileName, buffer, {
        httpMetadata: { contentType: file.type || 'image/webp' }
      });
      r2LocalPath = `/api/content/${fileName}`;
    } 
    else if (finalCoverUrl && bucket && finalCoverUrl.startsWith('http')) {
      try {
        const imgRes = await fetch(finalCoverUrl);
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/webp';
          const fileName = nhentaiId 
            ? `covers/manga/${nhentaiId}.webp` 
            : `covers/manga/fetch-${Date.now()}.webp`;
          
          const buffer = await imgRes.arrayBuffer();
          await bucket.put(fileName, buffer, { httpMetadata: { contentType } });
          r2LocalPath = `/api/content/${fileName}`;
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
    const db = locals.runtime?.env?.DB;

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
    const db = locals.runtime?.env?.DB;

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
