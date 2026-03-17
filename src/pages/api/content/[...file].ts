import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const fileName = params.file;
    if (!fileName) return new Response('Source filename missing', { status: 400 });

    // @ts-ignore
    const runtime = locals.runtime;
    let bucket = runtime?.env?.BUCKET || (locals as any).BUCKET;

    if (!bucket) {
      return new Response(`Binding Error: BUCKET not found in locals. (Keys: ${Object.keys(locals).join(',')})`, { status: 500 });
    }

    const object = await bucket.get(fileName);

    if (!object) {
      return new Response('File not found in R2 Storage', { status: 404 });
    }

    const headers = new Headers();
    try {
      object.writeHttpMetadata(headers);
    } catch (e) {
      // Fallback content type if helper fails
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif',
        'mp4': 'video/mp4',
        'webm': 'video/webm'
      };
      headers.set('Content-Type', mimeTypes[ext || ''] || 'application/octet-stream');
    }
    
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable'); 

    return new Response(object.body, { headers });
  } catch (err: any) {
    return new Response(`[VaultHUB R2 Error]: ${err.message}`, { status: 500 });
  }
};
