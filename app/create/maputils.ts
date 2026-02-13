/**
 * maputils.ts — Geographic data for gallery-quality rendering
 *
 * Uses Natural Earth 110m datasets via /api/geo proxy.
 * Never fetches directly from naciscdn.org (CORS blocked).
 *
 * 110m is intentional:
 * - Tiny files (~50-200KB), load instantly on Vercel
 * - The generalised coastlines feel hand-drawn at print scale
 * - Reliable — no timeouts, no CORS
 *
 * No synthetic contours or bathymetry. Only real geography.
 */

export type BBox = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

export type ProjectionParams = {
  bbox: BBox;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
};

export type GeographicData = {
  coastlines: any;
  rivers: any;
  lakes: any;
  land: any;
  borders: any;
};

const EMPTY: any = { type: 'FeatureCollection', features: [] };

// ============================================================================
// PROJECTION
// ============================================================================

export function projectToSVG(
  lng: number,
  lat: number,
  params: ProjectionParams
): { x: number; y: number } {
  const { bbox, width, height, offsetX, offsetY, scale } = params;

  const x = (lng - bbox.minLng) / (bbox.maxLng - bbox.minLng);
  const y = (bbox.maxLat - lat) / (bbox.maxLat - bbox.minLat);

  return {
    x: offsetX + x * width * scale,
    y: offsetY + y * height * scale,
  };
}

export function calculateProjection(
  bbox: BBox,
  canvasWidth: number,
  canvasHeight: number,
  margin: number
): ProjectionParams {
  const availableWidth = canvasWidth - margin * 2;
  const availableHeight = canvasHeight - margin * 2;

  const geoWidth = bbox.maxLng - bbox.minLng;
  const geoHeight = bbox.maxLat - bbox.minLat;

  const scaleX = availableWidth / geoWidth;
  const scaleY = availableHeight / geoHeight;
  const scale = Math.min(scaleX, scaleY);

  const offsetX = margin + (availableWidth - geoWidth * scale) / 2;
  const offsetY = margin + (availableHeight - geoHeight * scale) / 2;

  return {
    bbox,
    width: geoWidth,
    height: geoHeight,
    offsetX,
    offsetY,
    scale,
  };
}

// ============================================================================
// DATA FETCHING — all via /api/geo proxy
// ============================================================================

export async function fetchNaturalEarthData(bbox: BBox): Promise<GeographicData> {
  console.log('Fetching 110m geographic data for bbox:', bbox);

  const datasets = [
    'physical/ne_110m_coastline',
    'physical/ne_110m_rivers_lake_centerlines',
    'physical/ne_110m_lakes',
    'physical/ne_110m_land',
    'cultural/ne_110m_admin_0_boundary_lines_land',
  ];

  const results = await Promise.allSettled(
    datasets.map((ds) => fetchViaProxy(ds, bbox))
  );

  const get = (i: number) =>
    results[i].status === 'fulfilled' ? results[i].value : EMPTY;

  const data: GeographicData = {
    coastlines: get(0),
    rivers: get(1),
    lakes: get(2),
    land: get(3),
    borders: get(4),
  };

  // Log what loaded
  const summary = Object.entries(data)
    .filter(([, v]) => v?.features?.length > 0)
    .map(([k, v]) => `${k}: ${v.features.length}`)
    .join(', ');
  console.log('Geo loaded:', summary || '(none — check /api/geo route)');

  return data;
}

async function fetchViaProxy(dataset: string, bbox: BBox): Promise<any> {
  const url = `/api/geo?dataset=${encodeURIComponent(dataset)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`/api/geo returned ${response.status} for ${dataset}`);
  }

  const data = await response.json();
  return filterByBBox(data, bbox);
}

// ============================================================================
// BBOX FILTERING
// ============================================================================

function filterByBBox(geojson: any, bbox: BBox): any {
  if (!geojson?.features) return EMPTY;

  const expanded: BBox = {
    minLng: bbox.minLng - 5,
    maxLng: bbox.maxLng + 5,
    minLat: bbox.minLat - 5,
    maxLat: bbox.maxLat + 5,
  };

  const features = geojson.features.filter((f: any) =>
    intersects(f?.geometry, expanded)
  );

  return { type: 'FeatureCollection', features };
}

function intersects(geometry: any, bbox: BBox): boolean {
  if (!geometry?.coordinates) return false;
  return coordsInBBox(geometry.coordinates, bbox);
}

function coordsInBBox(coords: any, bbox: BBox): boolean {
  if (!Array.isArray(coords)) return false;

  if (typeof coords[0] === 'number') {
    return (
      coords[0] >= bbox.minLng &&
      coords[0] <= bbox.maxLng &&
      coords[1] >= bbox.minLat &&
      coords[1] <= bbox.maxLat
    );
  }

  return coords.some((c: any) => coordsInBBox(c, bbox));
}

// ============================================================================
// SVG PATH GENERATION
// ============================================================================

export function geoJSONToSVGPath(feature: any, projection: ProjectionParams): string {
  if (!feature?.geometry) return '';

  const { type, coordinates } = feature.geometry;
  const paths: string[] = [];

  if (type === 'Polygon') {
    paths.push(polygonToPath(coordinates, projection));
  } else if (type === 'MultiPolygon') {
    coordinates.forEach((poly: any) => paths.push(polygonToPath(poly, projection)));
  } else if (type === 'LineString') {
    paths.push(lineToPath(coordinates, projection));
  } else if (type === 'MultiLineString') {
    coordinates.forEach((line: any) => paths.push(lineToPath(line, projection)));
  }

  return paths.filter(Boolean).join(' ');
}

function polygonToPath(rings: any[], projection: ProjectionParams): string {
  return rings.map((ring) => lineToPath(ring, projection)).join(' ');
}

function lineToPath(coordinates: any[], projection: ProjectionParams): string {
  if (!coordinates?.length) return '';

  let path = '';
  let started = false;

  for (const coord of coordinates) {
    const [lng, lat] = coord;
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) continue;

    const { x, y } = projectToSVG(lng, lat, projection);

    if (!started) {
      path += `M ${x.toFixed(2)},${y.toFixed(2)}`;
      started = true;
    } else {
      path += ` L ${x.toFixed(2)},${y.toFixed(2)}`;
    }
  }

  return path;
}
