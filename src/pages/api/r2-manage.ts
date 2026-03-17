import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const url = new URL(request.url);
    const prefix = url.searchParams.get('prefix') || '';
    
    // Most reliable Astro 5/6 + Cloudflare Pages pattern
    // @ts-ignore
    let runtime = locals.runtime;
    let bucket = runtime?.env?.BUCKET;
    
    // Fallback lookup
    if (!bucket) {
      bucket = (locals as any).BUCKET;
    }
    
    // Diagnostic Fallback: If still no bucket, return status with details
    if (!bucket) {
      return new Response(JSON.stringify({ 
        error: "R2 Bucket 'BUCKET' binding not found.",
        envKeys: runtime?.env ? Object.keys(runtime.env) : "no_env",
        localsKeys: Object.keys(locals)
      }), { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const list = await bucket.list({ prefix, delimiter: '/' });
    
    return new Response(JSON.stringify({
      success: true,
      files: (list.objects || []).map((obj: any) => ({
        key: obj.key,
        size: obj.size,
        uploaded: obj.uploaded,
        url: `/api/content/${obj.key}`
      })),
      folders: (list.commonPrefixes || []).map((p: string) => p)
    }), { 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    // Serious fallback to prevent empty 500s
    return new Response(`[VaultHUB API Error]: ${err.message}\n${err.stack}`, { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string || '';

    // @ts-ignore
    const bucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;
    if (!bucket) throw new Error("BUCKET binding missing");

    const fileName = path ? `${path}/${file.name}` : file.name;
    const buffer = await file.arrayBuffer();
    
    await bucket.put(fileName, buffer, {
      httpMetadata: { contentType: file.type || 'application/octet-stream' }
    });

    return new Response(JSON.stringify({ success: true, key: fileName }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { key } = await request.json();
    // @ts-ignore
    const bucket = locals.runtime?.env?.BUCKET || (locals as any).BUCKET;
    if (!bucket) throw new Error("BUCKET binding missing");

    await bucket.delete(key);
    return new Response(JSON.stringify({ success: true }), { 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
