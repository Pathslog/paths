export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get('dataset');

  if (!dataset) {
    return new Response(JSON.stringify({ error: 'Missing dataset parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const cdnUrl = `https://naciscdn.org/naturalearth/10m/${dataset}.geojson`;
    const response = await fetch(cdnUrl);

    if (!response.ok) {
      throw new Error(`Natural Earth returned ${response.status}`);
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Geo proxy error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch geographic data' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
