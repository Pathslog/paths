export const runtime = 'nodejs';

// Allowed 110m datasets — small files (~50-200KB), load reliably on Vercel
const ALLOWED_DATASETS = new Set([
  'physical/ne_110m_coastline',
  'physical/ne_110m_rivers_lake_centerlines',
  'physical/ne_110m_lakes',
  'physical/ne_110m_land',
  'cultural/ne_110m_admin_0_boundary_lines_land',
  // 50m if you want to upgrade later
  'physical/ne_50m_coastline',
  'physical/ne_50m_rivers_lake_centerlines',
  'physical/ne_50m_lakes',
  'physical/ne_50m_land',
  'cultural/ne_50m_admin_0_boundary_lines_land',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get('dataset');

  if (!dataset) {
    return Response.json(
      { error: 'Missing dataset parameter' },
      { status: 400, headers: corsHeaders }
    );
  }

  if (!ALLOWED_DATASETS.has(dataset)) {
    return Response.json(
      { error: `Invalid dataset: ${dataset}` },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    const cdnUrl = `https://naciscdn.org/naturalearth/${dataset}.geojson`;

    const response = await fetch(cdnUrl, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`Natural Earth returned ${response.status}`);
    }

    const data = await response.json();

    return Response.json(data, {
      headers: {
        ...corsHeaders,
        'Cache-Control': 'public, max-age=604800, s-maxage=604800',
      },
    });
  } catch (error) {
    console.error('Geo proxy error:', error);
    return Response.json(
      { error: 'Failed to fetch geographic data' },
      { status: 500, headers: corsHeaders }
    );
  }
}

// CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}
