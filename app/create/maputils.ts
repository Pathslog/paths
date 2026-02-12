/**
 * maputils.ts – Gallery-quality cartography rendering
 * 
 * Fetches real geographic data (Natural Earth, elevation) and renders
 * it in an artistic, hand-drawn vintage cartography style suitable for gallery prints.
 * 
 * Layers:
 * - Elevation contours (hand-drawn with artistic variation)
 * - Coastlines & water bodies (Natural Earth)
 * - Rivers & waterways (Natural Earth)
 * - Administrative borders (Natural Earth)
 * - Bathymetry (ocean depth contours)
 */

type BBox = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};

type ProjectionParams = {
  bbox: BBox;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  scale: number;
};

type GeographicData = {
  coastlines: any;
  rivers: any;
  lakes: any;
  borders: any;
  contours: ContourLine[];
  bathymetry: ContourLine[];
};

type ContourLine = {
  points: Array<{ lng: number; lat: number }>;
  elevation: number;
};

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
// DATA FETCHING
// ============================================================================

/**
 * Fetch real geographic data from Natural Earth CDN and generate elevation contours
 */
export async function fetchNaturalEarthData(bbox: BBox): Promise<GeographicData> {
  console.log('Fetching geographic data for bbox:', bbox);

  try {
    // Parallel fetch of Natural Earth datasets
    const [coastlines, rivers, lakes, borders] = await Promise.all([
      fetchCoastlines(bbox),
      fetchRivers(bbox),
      fetchLakes(bbox),
      fetchBorders(bbox),
    ]);

    // Generate elevation contours based on synthetic terrain model
    // In production, this would fetch from GEBCO/ETOPO
    const contours = generateElevationContours(bbox);
    const bathymetry = generateBathymetryContours(bbox);

    return {
      coastlines,
      rivers,
      lakes,
      borders,
      contours,
      bathymetry,
    };
  } catch (error) {
    console.error('Error fetching geographic data:', error);
    // Graceful degradation: return empty data structure
    return {
      coastlines: { type: 'FeatureCollection', features: [] },
      rivers: { type: 'FeatureCollection', features: [] },
      lakes: { type: 'FeatureCollection', features: [] },
      borders: { type: 'FeatureCollection', features: [] },
      contours: [],
      bathymetry: [],
    };
  }
}

/**
 * Fetch coastlines from Natural Earth 10m dataset
 */
async function fetchCoastlines(bbox: BBox): Promise<any> {
  try {
    const url = 'https://naciscdn.org/naturalearth/10m/physical/ne_10m_coastline.geojson';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    return filterGeoJSONByBBox(data, bbox);
  } catch (error) {
    console.warn('Coastline fetch failed, using fallback:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Fetch rivers from Natural Earth 10m dataset
 */
async function fetchRivers(bbox: BBox): Promise<any> {
  try {
    const url = 'https://naciscdn.org/naturalearth/10m/physical/ne_10m_rivers_lake_centerlines.geojson';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    return filterGeoJSONByBBox(data, bbox);
  } catch (error) {
    console.warn('River fetch failed, using fallback:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Fetch lakes from Natural Earth 10m dataset
 */
async function fetchLakes(bbox: BBox): Promise<any> {
  try {
    const url = 'https://naciscdn.org/naturalearth/10m/physical/ne_10m_lakes.geojson';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    return filterGeoJSONByBBox(data, bbox);
  } catch (error) {
    console.warn('Lakes fetch failed, using fallback:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Fetch administrative borders from Natural Earth 10m dataset
 */
async function fetchBorders(bbox: BBox): Promise<any> {
  try {
    const url = 'https://naciscdn.org/naturalearth/10m/cultural/ne_10m_admin_0_boundaries.geojson';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    return filterGeoJSONByBBox(data, bbox);
  } catch (error) {
    console.warn('Border fetch failed, using fallback:', error);
    return { type: 'FeatureCollection', features: [] };
  }
}

// ============================================================================
// ELEVATION CONTOURS (Synthetic)
// ============================================================================

/**
 * Generate elevation contours using Perlin-like noise to simulate terrain
 * In production, this should be replaced with GEBCO/ETOPO raster data
 */
function generateElevationContours(bbox: BBox): ContourLine[] {
  const contours: ContourLine[] = [];
  
  // Generate contours at 250m intervals (typical topographic map)
  const contourIntervals = [250, 500, 750, 1000, 1250, 1500, 2000, 2500];
  
  for (const elevation of contourIntervals) {
    const points: Array<{ lng: number; lat: number }> = [];
    
    // Generate a contour line using parametric curves
    const numPoints = 60;
    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints;
      
      // Create organic undulating contours
      const baseOffset = (elevation / 1000) * 0.1;
      const variation = Math.sin(t * Math.PI * 4 + elevation) * 0.08;
      const perturbation = Math.sin(t * Math.PI * 7 + elevation * 1.3) * 0.04;
      
      const lat = bbox.minLat + (bbox.maxLat - bbox.minLat) * (baseOffset + variation + perturbation);
      const lng = bbox.minLng + (bbox.maxLng - bbox.minLng) * t;
      
      if (lng >= bbox.minLng && lng <= bbox.maxLng && 
          lat >= bbox.minLat && lat <= bbox.maxLat) {
        points.push({ lng, lat });
      }
    }
    
    if (points.length > 5) {
      contours.push({ points, elevation });
    }
  }
  
  return contours;
}

/**
 * Generate bathymetry (ocean depth) contours
 * Similar to elevation but only for areas outside the primary bbox
 */
function generateBathymetryContours(bbox: BBox): ContourLine[] {
  const contours: ContourLine[] = [];
  
  // Bathymetry at -200m, -500m, -1000m, -2000m
  const depthIntervals = [-200, -500, -1000, -2000];
  
  for (const depth of depthIntervals) {
    const points: Array<{ lng: number; lat: number }> = [];
    
    const numPoints = 40;
    for (let i = 0; i < numPoints; i++) {
      const t = i / numPoints;
      
      // Smoother curves for ocean
      const variation = Math.sin(t * Math.PI * 3 + depth) * 0.06;
      const perturbation = Math.sin(t * Math.PI * 5 + depth * 0.8) * 0.03;
      
      const lat = bbox.minLat + (bbox.maxLat - bbox.minLat) * (0.15 + variation + perturbation);
      const lng = bbox.minLng - (bbox.maxLng - bbox.minLng) * 0.2 + (bbox.maxLng - bbox.minLng) * t * 1.4;
      
      if (lng >= bbox.minLng - (bbox.maxLng - bbox.minLng) * 0.3 && 
          lng <= bbox.maxLng + (bbox.maxLng - bbox.minLng) * 0.3) {
        points.push({ lng, lat });
      }
    }
    
    if (points.length > 5) {
      contours.push({ points, elevation: depth });
    }
  }
  
  return contours;
}

// ============================================================================
// GEOJSON UTILITIES
// ============================================================================

/**
 * Filter GeoJSON features to only those intersecting the bbox
 */
function filterGeoJSONByBBox(geojson: any, bbox: BBox): any {
  if (!geojson || !geojson.features) {
    return { type: 'FeatureCollection', features: [] };
  }
  
  const filtered = geojson.features.filter((feature: any) =>
    geometryIntersectsBBox(feature.geometry, bbox)
  );
  
  return {
    type: 'FeatureCollection',
    features: filtered,
  };
}

/**
 * Check if a geometry intersects or touches the bbox
 */
function geometryIntersectsBBox(geometry: any, bbox: BBox): boolean {
  if (!geometry || !geometry.coordinates) return false;
  
  const expandedBbox = {
    minLng: bbox.minLng - 2,
    maxLng: bbox.maxLng + 2,
    minLat: bbox.minLat - 2,
    maxLat: bbox.maxLat + 2,
  };
  
  return checkCoordinatesInBBox(geometry.coordinates, expandedBbox);
}

function checkCoordinatesInBBox(coords: any, bbox: BBox): boolean {
  if (!Array.isArray(coords)) return false;
  
  if (typeof coords[0] === 'number') {
    // [lng, lat] point
    return (
      coords[0] >= bbox.minLng && coords[0] <= bbox.maxLng &&
      coords[1] >= bbox.minLat && coords[1] <= bbox.maxLat
    );
  }
  
  // Nested array
  return coords.some((item: any) => checkCoordinatesInBBox(item, bbox));
}

// ============================================================================
// SVG PATH GENERATION
// ============================================================================

/**
 * Convert GeoJSON feature to SVG path with hand-drawn artistic styling
 */
export function geoJSONToSVGPath(
  feature: any,
  projection: ProjectionParams
): string {
  if (!feature || !feature.geometry) return '';

  const geometry = feature.geometry;
  const type = geometry.type;
  let paths: string[] = [];

  if (type === 'Polygon') {
    paths.push(polygonToPath(geometry.coordinates, projection));
  } else if (type === 'MultiPolygon') {
    geometry.coordinates.forEach((polygon: any) => {
      paths.push(polygonToPath(polygon, projection));
    });
  } else if (type === 'LineString') {
    paths.push(lineStringToPath(geometry.coordinates, projection));
  } else if (type === 'MultiLineString') {
    geometry.coordinates.forEach((line: any) => {
      paths.push(lineStringToPath(line, projection));
    });
  }

  return paths.join(' ');
}

/**
 * Convert contour line to SVG path with artistic variation
 */
export function contourToSVGPath(
  contour: ContourLine,
  projection: ProjectionParams
): string {
  if (!contour.points || contour.points.length === 0) return '';

  const points = contour.points.map(p => projectToSVG(p.lng, p.lat, projection));
  
  // Add hand-drawn variation to contour lines
  const smoothedPoints = applySketchyVariation(points, contour.elevation);
  
  let path = '';
  smoothedPoints.forEach((point, i) => {
    if (i === 0) {
      path += `M ${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    } else {
      path += ` L ${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    }
  });
  
  return path;
}

/**
 * Apply sketchy, hand-drawn variation to points
 * Creates the vintage cartography effect
 */
function applySketchyVariation(
  points: Array<{ x: number; y: number }>,
  seed: number
): Array<{ x: number; y: number }> {
  const varied: Array<{ x: number; y: number }> = [];
  const amplitude = Math.abs(seed) % 2; // Vary amplitude by elevation
  const freq1 = 3 + (seed % 5);
  const freq2 = 8 + (seed % 7);
  
  points.forEach((point, i) => {
    const t = i / points.length;
    const wave1 = Math.sin(t * Math.PI * freq1) * amplitude * 0.3;
    const wave2 = Math.sin(t * Math.PI * freq2) * amplitude * 0.15;
    const noise = (Math.random() - 0.5) * amplitude * 0.2;
    
    varied.push({
      x: point.x + wave1 + noise,
      y: point.y + wave2 + noise * 0.5,
    });
  });
  
  return varied;
}

function polygonToPath(rings: any[], projection: ProjectionParams): string {
  return rings
    .map((ring) => lineStringToPath(ring, projection))
    .join(' ');
}

function lineStringToPath(coordinates: any[], projection: ProjectionParams): string {
  if (!coordinates || coordinates.length === 0) return '';

  let path = '';
  coordinates.forEach((coord, i) => {
    const [lng, lat] = coord;
    
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return;
    
    const { x, y } = projectToSVG(lng, lat, projection);
    
    if (i === 0) {
      path += `M ${x.toFixed(2)},${y.toFixed(2)}`;
    } else {
      path += ` L ${x.toFixed(2)},${y.toFixed(2)}`;
    }
  });
  
  return path;
}