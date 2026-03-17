import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  const fileName = params.file;
  if (!fileName) return new Response('Not Found', { status: 404 });

  // Extremely robust binding lookup
  let bucket = locals.runtime?.env?.BUCKET;
  if (!bucket) bucket = (locals as any).BUCKET;
  if (!bucket) bucket = (globalThis as any).BUCKET;

  if (!bucket) {
    return new Response('R2 Bucket binding (BUCKET) not found', { status: 500 });
  }

  try {
    const object = await bucket.get(fileName);

    if (!object) {
      return new Response('File Not Found in R2', { status: 404 });
    }

    const headers = new Headers();
    // Use try-catch for metadata to avoid crashes on weird files
    try {
      object.writeHttpMetadata(headers);
    } catch (e) {}
    
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000'); 

    // Handle range requests if needed, but for now simple response
    return new Response(object.body, { headers });
  } catch (error: any) {
    return new Response(`R2 Fetch Error: ${error.message}`, { status: 500 });
  }
};
