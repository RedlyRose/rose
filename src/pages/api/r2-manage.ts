import type { APIRoute } from 'astro';

const getBucket = (locals: any) => locals.runtime?.env?.BUCKET;

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const delimiter = url.searchParams.get('delimiter') || '/';

  const bucket = getBucket(locals);

  if (!bucket) {
    return new Response('Bucket not found', { status: 500 });
  }

  try {
    const list = await bucket.list({ prefix, delimiter });
    return new Response(JSON.stringify({
      files: (list.objects || []).map((obj: any) => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        url: `/api/content/${obj.key}`
      })),
      folders: (list.commonPrefixes || []).map((p: string) => p)
    }), { headers: { 'content-type': 'application/json' } });
  } catch (err: any) {
    return new Response(err.message, { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string || '';

    if (!file) return new Response('No file provided', { status: 400 });

    const bucket = getBucket(locals);
    if (!bucket) return new Response('Bucket not found', { status: 500 });

    const fileName = path ? `${path}/${file.name}` : file.name;
    const buffer = await file.arrayBuffer();
    
    await bucket.put(fileName, buffer, {
      httpMetadata: { contentType: file.type }
    });

    return new Response(JSON.stringify({ success: true, key: fileName }), { status: 200 });
  } catch (err: any) {
    return new Response(err.message, { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { key } = await request.json();
    if (!key) return new Response('No key provided', { status: 400 });

    const bucket = getBucket(locals);
    if (!bucket) return new Response('Bucket not found', { status: 500 });

    await bucket.delete(key);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(err.message, { status: 500 });
  }
};
