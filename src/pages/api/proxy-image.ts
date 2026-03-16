import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ url }) => {
  const mediaId = url.searchParams.get('media_id');
  const type = url.searchParams.get('type') || 'thumb';
  const ext = url.searchParams.get('ext') || 'webp';

  if (!mediaId) return new Response('Missing media_id', { status: 400 });

  // Try different image server mirrors
  const mirrors = [
    type === 'img' ? `https://i3.nhentai.net/galleries/${mediaId}/1.${ext}` : `https://t3.nhentai.net/galleries/${mediaId}/thumb.${ext}`,
    type === 'img' ? `https://i.nhentai.net/galleries/${mediaId}/1.${ext}` : `https://t.nhentai.net/galleries/${mediaId}/thumb.${ext}`,
    type === 'img' ? `https://i2.nhentai.net/galleries/${mediaId}/1.${ext}` : `https://t2.nhentai.net/galleries/${mediaId}/thumb.${ext}`
  ];

  for (const nhentaiUrl of mirrors) {
    try {
      const response = await fetch(nhentaiUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://nhentai.net/',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        return new Response(blob, {
          headers: {
            'Content-Type': response.headers.get('Content-Type') || 'image/webp',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    } catch (e) {
      console.error(`Mirror ${nhentaiUrl} failed:`, e);
    }
  }

  // Final fallback: Return a distinct "Broken" placeholder so we know the proxy reached its end
  return fetch('https://images.unsplash.com/photo-1614850523296-62c09b68a441?q=80&w=250&h=350&auto=format&fit=crop');
};
