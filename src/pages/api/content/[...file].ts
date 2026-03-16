import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, locals }) => {
  const fileName = params.file;
  if (!fileName) return new Response('Not Found', { status: 404 });

  const env = locals.runtime?.env;
  const bucket = env?.BUCKET;

  if (!bucket) {
    return new Response('Bucket binding not found', { status: 500 });
  }

  try {
    const object = await bucket.get(fileName);

    if (!object) {
      return new Response('File Not Found', { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error('Error fetching from R2:', error);
    return new Response('Error fetching from R2', { status: 500 });
  }
};
