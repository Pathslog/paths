export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get('dataset');

  if (!dataset) {
    return Response.json(
      { error: 'Missing dataset parameter' },
      { status: 400 }
    );
  }

  try {
    const cdnUrl = `https://naciscdn.org/naturalearth/10m/${dataset}.geojson`;
    const response = await fetch(cdnUrl);

    if (!response.ok) {
      throw new Error(`Natural Earth returned ${response.status}`);
    }

    const data = await response.json();

    return Response.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Geo proxy error:', error);
    return Response.json(
      { error: 'Failed to fetch geographic data' },
      { status: 500 }
    );
  }
}
