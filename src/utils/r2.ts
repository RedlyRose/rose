export async function getR2Content(runtime: any) {
  try {
    const bucket = runtime?.env?.BUCKET || runtime?.BUCKET;
    
    if (bucket) {
      const list = await bucket.list();
      return (list.objects || []).map((obj: any) => ({
        key: obj.key,
        url: `/api/content/${obj.key}`
      }));
    }
  } catch (error) {
    console.error('Error listing R2 content:', error);
  }

  return [];
}
