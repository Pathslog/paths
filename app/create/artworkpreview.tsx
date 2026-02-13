"use client";

import { X } from "lucide-react";
import { useState, useEffect } from "react";
import {
  calculateProjection,
  projectToSVG,
  fetchNaturalEarthData,
  geoJSONToSVGPath,
} from "./maputils";

type GeoAnchor = {
  lng: number;
  lat: number;
};

type PreviewProps = {
  anchors: GeoAnchor[];
  title: string;
  origin: string;
  destination: string;
  curvatureMode: "calm" | "balanced" | "tension";
  onClose: () => void;
  onExport: () => void;
};

const CURVATURE = {
  calm: 0.08,
  balanced: 0.11,
  tension: 0.14,
};

export default function ArtworkPreview({
  anchors,
  title,
  origin,
  destination,
  curvatureMode,
  onClose,
  onExport,
}: PreviewProps) {
  const [geoData, setGeoData] = useState<any>(null);
  const [isLoadingGeo, setIsLoadingGeo] = useState(true);

  if (anchors.length < 2) return null;

  // A2 dimensions in mm
  const printWidth = 420;
  const printHeight = 594;
  const margin = 40;
  const titleAreaHeight = 80;
  const footerHeight = 60;

  // Calculate bounds
  const lngs = anchors.map((a) => a.lng);
  const lats = anchors.map((a) => a.lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  const lngPadding = (maxLng - minLng) * 0.1;
  const latPadding = (maxLat - minLat) * 0.1;

  const bbox = {
    minLng: minLng - lngPadding,
    maxLng: maxLng + lngPadding,
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
  };

  const mapAreaWidth = printWidth - margin * 2;
  const mapAreaHeight = printHeight - margin * 2 - titleAreaHeight - footerHeight;

  const projection = calculateProjection(bbox, mapAreaWidth, mapAreaHeight, 0);

  // Fetch geographic data on mount
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoadingGeo(true);
      try {
        const data = await fetchNaturalEarthData(bbox);
        if (!cancelled) setGeoData(data);
      } catch (err) {
        console.error("Failed to load geo data:", err);
      } finally {
        if (!cancelled) setIsLoadingGeo(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [bbox.minLng, bbox.maxLng, bbox.minLat, bbox.maxLat]);

  // Projection helper
  const geoToSVG = (lng: number, lat: number) => {
    const projected = projectToSVG(lng, lat, projection);
    return {
      x: margin + projected.x,
      y: margin + titleAreaHeight + projected.y,
    };
  };

  // Generate humanized path segment — same logic as your main page
  const generatePathSegment = (
    p0: GeoAnchor,
    p2: GeoAnchor,
    k: number
  ): string => {
    const dLng = p2.lng - p0.lng;
    const dLat = p2.lat - p0.lat;
    const distance = Math.sqrt(dLng * dLng + dLat * dLat);

    const perpLng = -dLat / distance;
    const perpLat = dLng / distance;

    const midLng = (p0.lng + p2.lng) / 2;
    const midLat = (p0.lat + p2.lat) / 2;

    const curveVariation = 0.8 + Math.random() * 0.4;
    const offset = distance * k * curveVariation;
    const asymmetry = -0.05 + Math.random() * 0.1;
    const randomPerpOffset = (Math.random() - 0.5) * distance * 0.03;

    const p1 = {
      lng: midLng + perpLng * (offset + randomPerpOffset) + dLng * asymmetry,
      lat: midLat + perpLat * (offset + randomPerpOffset) + dLat * asymmetry,
    };

    const steps = 100;
    const points: GeoAnchor[] = [];

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      const lng = mt * mt * p0.lng + 2 * mt * t * p1.lng + t * t * p2.lng;
      const lat = mt * mt * p0.lat + 2 * mt * t * p1.lat + t * t * p2.lat;
      points.push({ lng, lat });
    }

    // Apply sketchy noise (hand-drawn feel)
    const baseAmplitude = distance * 0.008;
    const freq1 = 3 + Math.random() * 2;
    const freq2 = 8 + Math.random() * 4;
    const freq3 = 15 + Math.random() * 5;
    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    const phase3 = Math.random() * Math.PI * 2;

    const humanizedPoints = points.map((point, index) => {
      const t = index / points.length;
      const wave1 = Math.sin(t * Math.PI * freq1 + phase1) * baseAmplitude;
      const wave2 = Math.sin(t * Math.PI * freq2 + phase2) * baseAmplitude * 0.5;
      const wave3 = Math.sin(t * Math.PI * freq3 + phase3) * baseAmplitude * 0.25;
      const totalNoise = wave1 + wave2 + wave3;

      return {
        lng: point.lng + perpLng * totalNoise,
        lat: point.lat + perpLat * totalNoise,
      };
    });

    // Light smoothing
    const smoothed: GeoAnchor[] = [];
    const windowSize = 2;

    for (let i = 0; i < humanizedPoints.length; i++) {
      if (i < windowSize || i >= humanizedPoints.length - windowSize) {
        smoothed.push(humanizedPoints[i]);
      } else {
        let sumLng = 0;
        let sumLat = 0;
        for (let j = -windowSize; j <= windowSize; j++) {
          sumLng += humanizedPoints[i + j].lng;
          sumLat += humanizedPoints[i + j].lat;
        }
        smoothed.push({
          lng: sumLng / (windowSize * 2 + 1),
          lat: sumLat / (windowSize * 2 + 1),
        });
      }
    }

    const svgPoints = smoothed.map((p) => geoToSVG(p.lng, p.lat));
    let pathData = `M ${svgPoints[0].x},${svgPoints[0].y}`;
    for (let i = 1; i < svgPoints.length; i++) {
      pathData += ` L ${svgPoints[i].x},${svgPoints[i].y}`;
    }

    return pathData;
  };

  // Build complete path
  const k = CURVATURE[curvatureMode];
  let fullPath = "";
  const anchorPositions: { x: number; y: number }[] = [];

  for (let i = 0; i < anchors.length - 1; i++) {
    fullPath += generatePathSegment(anchors[i], anchors[i + 1], k);
  }

  anchors.forEach((anchor) => {
    anchorPositions.push(geoToSVG(anchor.lng, anchor.lat));
  });

  const displayTitle = title || "Untitled Journey";
  const currentYear = new Date().getFullYear();

  // Check if geo data has real features
  const hasCoastlines = geoData?.coastlines?.features?.length > 0;
  const hasLand = geoData?.land?.features?.length > 0;
  const hasRivers = geoData?.rivers?.features?.length > 0;
  const hasLakes = geoData?.lakes?.features?.length > 0;
  const hasBorders = geoData?.borders?.features?.length > 0;
  const hasAnyGeo = hasCoastlines || hasLand || hasRivers || hasLakes || hasBorders;

  return (
    <div className="fixed inset-0 bg-neutral-900 bg-opacity-95 z-50 flex items-center justify-center p-8">
      <button
        onClick={onClose}
        className="absolute top-6 left-6 text-white hover:text-neutral-300 transition-colors flex items-center gap-2 text-sm uppercase tracking-wider"
      >
        <X size={20} />
        Back to Edit
      </button>

      <button
        onClick={onExport}
        className="absolute top-6 right-6 px-6 py-3 bg-white text-neutral-900 hover:bg-neutral-100 transition-colors text-sm uppercase tracking-wider font-medium"
      >
        Export SVG
      </button>

      <div
        className="w-full max-w-4xl bg-white shadow-2xl"
        style={{ aspectRatio: "420/594" }}
      >
        {isLoadingGeo && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-neutral-900 text-white px-4 py-2 text-xs uppercase tracking-wider opacity-75 z-10">
            Loading geographic data...
          </div>
        )}

        <svg
          viewBox={`0 0 ${printWidth} ${printHeight}`}
          className="w-full h-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Paper background */}
          <rect width={printWidth} height={printHeight} fill="#F5F1E8" />

          {/* Paper texture */}
          <filter id="paper-texture">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="4"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="saturate"
              values="0"
              result="desaturatedNoise"
            />
            <feComponentTransfer in="desaturatedNoise" result="theNoise">
              <feFuncA type="discrete" tableValues="0 0 0 0 0 0.02 0" />
            </feComponentTransfer>
            <feBlend
              in="SourceGraphic"
              in2="theNoise"
              mode="multiply"
            />
          </filter>
          <rect
            width={printWidth}
            height={printHeight}
            fill="#F5F1E8"
            filter="url(#paper-texture)"
          />

          {/* Subtle vignette */}
          <defs>
            <radialGradient id="vignette">
              <stop offset="30%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(139,125,107,0.08)" />
            </radialGradient>
          </defs>
          <rect
            width={printWidth}
            height={printHeight}
            fill="url(#vignette)"
          />

          {/* ============ GEOGRAPHIC LAYERS ============ */}

          {/* Layer 1: Land mass fill (very subtle warm tint) */}
          {!isLoadingGeo && hasLand && (
            <g opacity="0.06" fill="#D4C9BA" stroke="none">
              {geoData.land.features.map((feature: any, i: number) => {
                const pathData = geoJSONToSVGPath(feature, projection);
                if (!pathData) return null;
                return <path key={`land-${i}`} d={pathData} />;
              })}
            </g>
          )}

          {/* Layer 2: Lakes */}
          {!isLoadingGeo && hasLakes && (
            <g opacity="0.12" fill="#A8C5D6" stroke="none">
              {geoData.lakes.features.map((feature: any, i: number) => {
                const pathData = geoJSONToSVGPath(feature, projection);
                if (!pathData) return null;
                return <path key={`lake-${i}`} d={pathData} />;
              })}
            </g>
          )}

          {/* Layer 3: Rivers */}
          {!isLoadingGeo && hasRivers && (
            <g
              opacity="0.22"
              stroke="#7B9CAA"
              strokeWidth="0.35"
              fill="none"
              strokeLinecap="round"
            >
              {geoData.rivers.features.map((feature: any, i: number) => {
                const pathData = geoJSONToSVGPath(feature, projection);
                if (!pathData) return null;
                return <path key={`river-${i}`} d={pathData} />;
              })}
            </g>
          )}

          {/* Layer 4: Coastlines */}
          {!isLoadingGeo && hasCoastlines && (
            <g
              opacity="0.28"
              stroke="#8B7D6B"
              strokeWidth="0.55"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {geoData.coastlines.features.map((feature: any, i: number) => {
                const pathData = geoJSONToSVGPath(feature, projection);
                if (!pathData) return null;
                return <path key={`coast-${i}`} d={pathData} />;
              })}
            </g>
          )}

          {/* Layer 5: Administrative borders */}
          {!isLoadingGeo && hasBorders && (
            <g
              opacity="0.15"
              stroke="#A39B8F"
              strokeWidth="0.3"
              fill="none"
              strokeDasharray="2,1"
              strokeLinecap="round"
            >
              {geoData.borders.features.map((feature: any, i: number) => {
                const pathData = geoJSONToSVGPath(feature, projection);
                if (!pathData) return null;
                return <path key={`border-${i}`} d={pathData} />;
              })}
            </g>
          )}

          {/* Fallback grid — only if no geo data loaded at all */}
          {!isLoadingGeo && !hasAnyGeo && (
            <g opacity="0.12" stroke="#8B7D6B" strokeWidth="0.2" fill="none">
              {Array.from({ length: 10 }, (_, i) => {
                const lng =
                  bbox.minLng + ((bbox.maxLng - bbox.minLng) * i) / 9;
                const top = geoToSVG(lng, bbox.maxLat);
                const bottom = geoToSVG(lng, bbox.minLat);
                return (
                  <line
                    key={`lng-${i}`}
                    x1={top.x}
                    y1={top.y}
                    x2={bottom.x}
                    y2={bottom.y}
                  />
                );
              })}
              {Array.from({ length: 8 }, (_, i) => {
                const lat =
                  bbox.minLat + ((bbox.maxLat - bbox.minLat) * i) / 7;
                const left = geoToSVG(bbox.minLng, lat);
                const right = geoToSVG(bbox.maxLng, lat);
                return (
                  <line
                    key={`lat-${i}`}
                    x1={left.x}
                    y1={left.y}
                    x2={right.x}
                    y2={right.y}
                  />
                );
              })}
            </g>
          )}

          {/* ============ JOURNEY PATH ============ */}

          <path
            d={fullPath}
            stroke="#3f3b36"
            strokeWidth="0.75"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Anchor points */}
          {anchorPositions.map((pos, index) => {
            const isEndpoint = index === 0 || index === anchors.length - 1;

            if (isEndpoint) {
              return (
                <circle
                  key={index}
                  cx={pos.x}
                  cy={pos.y}
                  r="1.5"
                  fill="#3f3b36"
                />
              );
            } else {
              return (
                <circle
                  key={index}
                  cx={pos.x}
                  cy={pos.y}
                  r="1.2"
                  fill="none"
                  stroke="#3f3b36"
                  strokeWidth="0.4"
                />
              );
            }
          })}

          {/* ============ TYPOGRAPHY ============ */}

          <text
            x={printWidth / 2}
            y={margin + 45}
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="18"
            fill="#3f3b36"
            letterSpacing="0.5"
          >
            {displayTitle}
          </text>

          <text
            x={printWidth / 2}
            y={margin + 62}
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="6"
            fill="#8B7D6B"
            letterSpacing="1.5"
          >
            {origin && destination
              ? `${origin.toUpperCase()} — ${destination.toUpperCase()}`
              : origin
              ? origin.toUpperCase()
              : "ORIGIN — DESTINATION"}
          </text>

          <text
            x={printWidth / 2}
            y={margin + 72}
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="5"
            fill="#8B7D6B"
            letterSpacing="0.8"
          >
            {currentYear}
          </text>

          <text
            x={printWidth / 2}
            y={printHeight - margin - 20}
            textAnchor="middle"
            fontFamily="Georgia, serif"
            fontSize="4.5"
            fill="#A39B8F"
            letterSpacing="0.5"
          >
            {anchors.length} waypoints · Created{" "}
            {new Date().toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </text>

          {/* Border frame */}
          <rect
            x={margin - 5}
            y={margin - 5}
            width={printWidth - margin * 2 + 10}
            height={printHeight - margin * 2 + 10}
            fill="none"
            stroke="#D4C9BA"
            strokeWidth="0.3"
          />
        </svg>
      </div>
    </div>
  );
}
