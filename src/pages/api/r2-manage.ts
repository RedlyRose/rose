import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || '';
  const delimiter = url.searchParams.get('delimiter') || '/';

  // Diagnostic info
  const checkRuntime = !!locals.runtime;
  const checkEnv = !!locals.runtime?.env;
  const bucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;

  if (!bucket) {
    return new Response(JSON.stringify({ 
      error: 'Bucket binding missing',
      diagnostics: {
        hasRuntime: checkRuntime,
        hasEnv: checkEnv,
        runtimeKeys: checkRuntime ? Object.keys(locals.runtime) : [],
        envKeys: checkEnv ? Object.keys(locals.runtime.env) : []
      }
    }), { 
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
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
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string || '';

    if (!file) return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 });

    const bucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;
    if (!bucket) return new Response(JSON.stringify({ error: 'Bucket not found' }), { status: 500 });

    const fileName = path ? `${path}/${file.name}` : file.name;
    const buffer = await file.arrayBuffer();
    
    await bucket.put(fileName, buffer, {
      httpMetadata: { contentType: file.type }
    });

    return new Response(JSON.stringify({ success: true, key: fileName }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { key } = await request.json();
    if (!key) return new Response(JSON.stringify({ error: 'No key provided' }), { status: 400 });

    const bucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;
    if (!bucket) return new Response(JSON.stringify({ error: 'Bucket not found' }), { status: 500 });

    await bucket.delete(key);
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
