import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const runtime = (locals as any).runtime;
    const bucket = runtime?.env?.BUCKET || (locals as any).BUCKET;

    if (!bucket) {
      return new Response(JSON.stringify({ 
        error: "R2 bucket 'BUCKET' not found in locals.runtime.env",
        availableLocals: Object.keys(locals),
        hasRuntime: !!runtime
      }), { status: 500, headers: {'Content-Type': 'application/json'} });
    }

    const list = await bucket.list({ limit: 10 });
    return new Response(JSON.stringify({
      success: true,
      files: list.objects.map((o: any) => o.key)
    }), { headers: {'Content-Type': 'application/json'} });

  } catch (err: any) {
    return new Response(JSON.stringify({ 
      error: "Exception in R2 API",
      message: err.message,
      stack: err.stack
    }), { status: 500, headers: {'Content-Type': 'application/json'} });
  }
};
