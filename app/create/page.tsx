"use client";

import { useRef, useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import { MapPin, Trash2 } from "lucide-react";
import mapboxgl from "mapbox-gl";
import ArtworkPreview from "./artworkpreview";
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

// Curvature presets
const CURVATURE = {
  calm: 0.08,
  balanced: 0.11,
  tension: 0.14,
};

// Map styles
const MAP_STYLES = {
  minimal: "mapbox://styles/mapbox/light-v11",
  subtle: "mapbox://styles/mapbox/streets-v12",
};

export default function CreatePath() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  
  const [geoAnchors, setGeoAnchors] = useState<GeoAnchor[]>([]);
  const [title, setTitle] = useState("");
  const [currentPathId, setCurrentPathId] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [curvatureMode, setCurvatureMode] = useState<"calm" | "balanced" | "tension">("balanced");
  const [mapStyle, setMapStyle] = useState<"minimal" | "subtle">("minimal");
  const [isEraseMode, setIsEraseMode] = useState(false);
  const [markers, setMarkers] = useState<mapboxgl.Marker[]>([]);
  const [startLocation, setStartLocation] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");

  // Geocode start location
  const searchLocation = async () => {
    if (!startLocation.trim() || !mapRef.current) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          startLocation
        )}.json?access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        mapRef.current.flyTo({
          center: [lng, lat],
          zoom: 10,
          duration: 2000,
        });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  // Initialize Mapbox
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!mapboxToken) {
      console.error("Mapbox token not found");
      return;
    }

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES[mapStyle],
      center: [-0.1276, 51.5074], // London default
      zoom: 5,
      preserveDrawingBuffer: true,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    mapRef.current = map;

    return () => {
      map.remove();
    };
  }, []);

  // Click handler
  useEffect(() => {
    if (!mapRef.current) return;

    const map = mapRef.current;

    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      if (isEraseMode) {
        setGeoAnchors((prev) => {
          if (prev.length > 0) {
            const updated = prev.slice(0, -1);
            setTimeout(() => savePath(), 100);
            return updated;
          }
          return prev;
        });
      } else {
        const newAnchor = { lng: e.lngLat.lng, lat: e.lngLat.lat };
        setGeoAnchors((prev) => {
          const updated = [...prev, newAnchor];
          setTimeout(() => savePath(), 100);
          return updated;
        });
      }
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
    };
  }, [isEraseMode]);

  // Update map style
  useEffect(() => {
    if (!mapRef.current) return;
    
    const map = mapRef.current;
    
    const viewState = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    
    map.setStyle(MAP_STYLES[mapStyle]);
    
    map.once('style.load', () => {
      map.jumpTo(viewState);
      setTimeout(() => {
        drawPathOnMap();
      }, 100);
    });
  }, [mapStyle]);

  // Update markers and path when anchors change
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers
    markers.forEach((marker) => marker.remove());

    // If no anchors, clear everything
    if (geoAnchors.length === 0) {
      setMarkers([]);
      // Clear the path layer
      const map = mapRef.current;
      if (map.getLayer("path-layer")) {
        map.removeLayer("path-layer");
      }
      if (map.getSource("path-source")) {
        map.removeSource("path-source");
      }
      return;
    }

    // Add new markers
    const newMarkers = geoAnchors.map((anchor, index) => {
      const el = document.createElement("div");
      el.style.width = "12px";
      el.style.height = "12px";
      el.style.borderRadius = "50%";
      el.style.backgroundColor = index === 0 || index === geoAnchors.length - 1 ? "#3f3b36" : "#6B7280";
      el.style.border = "2px solid white";
      el.style.cursor = "pointer";
      el.style.boxShadow = "0 2px 4px rgba(0,0,0,0.2)";

      const marker = new mapboxgl.Marker({ element: el, anchor: "center" })
        .setLngLat([anchor.lng, anchor.lat])
        .addTo(mapRef.current!);

      return marker;
    });

    setMarkers(newMarkers);
    drawPathOnMap();
  }, [geoAnchors, curvatureMode, isEraseMode]);

  // Generate humanized path
  const generateHumanizedPath = (p0: GeoAnchor, p2: GeoAnchor, curvature: number): GeoAnchor[] => {
    const points: GeoAnchor[] = [];

    const dLng = p2.lng - p0.lng;
    const dLat = p2.lat - p0.lat;
    const distance = Math.sqrt(dLng * dLng + dLat * dLat);
    
    const perpLng = -dLat / distance;
    const perpLat = dLng / distance;
    
    const midLng = (p0.lng + p2.lng) / 2;
    const midLat = (p0.lat + p2.lat) / 2;
    
    const curveVariation = 0.8 + Math.random() * 0.4;
    const offset = distance * curvature * curveVariation;
    
    const asymmetry = -0.05 + Math.random() * 0.1;
    
    const randomPerpOffset = (Math.random() - 0.5) * distance * 0.03;
    
    const p1 = {
      lng: midLng + perpLng * (offset + randomPerpOffset) + dLng * asymmetry,
      lat: midLat + perpLat * (offset + randomPerpOffset) + dLat * asymmetry,
    };

    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const mt = 1 - t;

      const lng = mt * mt * p0.lng + 2 * mt * t * p1.lng + t * t * p2.lng;
      const lat = mt * mt * p0.lat + 2 * mt * t * p1.lat + t * t * p2.lat;

      points.push({ lng, lat });
    }

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

    return smoothed;
  };

  // Draw path on map
  const drawPathOnMap = () => {
    if (!mapRef.current || geoAnchors.length < 2) return;

    const map = mapRef.current;

    // Remove existing layer and source
    if (map.getLayer("path-layer")) map.removeLayer("path-layer");
    if (map.getSource("path-source")) map.removeSource("path-source");

    // Build path from anchors
    const allPathPoints: GeoAnchor[] = [];
    const k = CURVATURE[curvatureMode];

    for (let i = 0; i < geoAnchors.length - 1; i++) {
      const segment = generateHumanizedPath(geoAnchors[i], geoAnchors[i + 1], k);
      allPathPoints.push(...segment);
    }

    // Create GeoJSON
    const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: allPathPoints.map((p) => [p.lng, p.lat]),
      },
      properties: {},
    };

    // Add source and layer
    map.addSource("path-source", {
      type: "geojson",
      data: geojson,
    });

    map.addLayer({
      id: "path-layer",
      type: "line",
      source: "path-source",
      paint: {
        "line-color": "#3f3b36",
        "line-width": 2,
        "line-opacity": 0.7,
      },
    });
  };

  // Save path to database
  const savePath = async () => {
    if (!title.trim()) return;

    try {
      if (currentPathId) {
        const { error } = await supabase
          .from("paths")
          .update({
            title,
            points: geoAnchors,
            origin,
            destination,
            curvature_mode: curvatureMode,
          })
          .eq("id", currentPathId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("paths")
          .insert({
            title,
            points: geoAnchors,
            origin,
            destination,
            curvature_mode: curvatureMode,
          })
          .select("id")
          .single();

        if (error) throw error;
        if (data) setCurrentPathId(data.id);
      }
    } catch (error) {
      console.error("Save error:", error);
    }
  };

  // Load most recent path
  useEffect(() => {
    const loadPath = async () => {
      try {
        const { data, error } = await supabase
          .from("paths")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error && error.code !== "PGRST116") throw error;

        if (data) {
          setCurrentPathId(data.id);
          setTitle(data.title || "");
          setGeoAnchors(data.points || []);
          setOrigin(data.origin || "");
          setDestination(data.destination || "");
          setCurvatureMode(data.curvature_mode || "balanced");
        }

        setHasLoaded(true);
      } catch (error) {
        console.error("Load error:", error);
        setHasLoaded(true);
      }
    };

    loadPath();
  }, []);

  // Handle title change
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    if (newTitle.trim()) {
      setTimeout(() => savePath(), 300);
    }
  };

  // Clear path - instant, no dialog
  const clearPath = () => {
    setGeoAnchors([]);
    setTitle("");
    setOrigin("");
    setDestination("");
    setCurrentPathId(null);
  };

  // ============================================================================
  // EXPORT AS SVG WITH GEOGRAPHIC DATA
  // ============================================================================

  const exportAsPNG = async () => {
    try {
      if (geoAnchors.length < 2) {
        alert("Need at least 2 points to export");
        return;
      }

      console.log("Export starting...");

      const printWidthMM = 420;
      const printHeightMM = 594;
      const margin = 40;
      const titleAreaHeight = 80;
      const footerHeight = 60;

      const lngs = geoAnchors.map((a) => a.lng);
      const lats = geoAnchors.map((a) => a.lat);
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

      console.log("BBox:", bbox);

      const mapAreaWidth = printWidthMM - margin * 2;
      const mapAreaHeight = printHeightMM - margin * 2 - titleAreaHeight - footerHeight;

      const projection = calculateProjection(bbox, mapAreaWidth, mapAreaHeight, 0);

      const geoToSVG = (lng: number, lat: number) => {
        const projected = projectToSVG(lng, lat, projection);
        return {
          x: margin + projected.x,
          y: margin + titleAreaHeight + projected.y,
        };
      };

      console.log("Fetching geographic data...");
      let geoData = null;
      try {
        geoData = await fetchNaturalEarthData(bbox);
        console.log("Geographic data fetched successfully:", geoData);
      } catch (fetchError) {
        console.warn("Geographic data fetch failed, using fallback:", fetchError);
        geoData = {
          coastlines: { type: 'FeatureCollection', features: [] },
          rivers: { type: 'FeatureCollection', features: [] },
          lakes: { type: 'FeatureCollection', features: [] },
          land: { type: 'FeatureCollection', features: [] },
          borders: { type: 'FeatureCollection', features: [] },
        };
      }

      const displayTitle = title || "Untitled Journey";
      const currentYear = new Date().getFullYear();
      const creationDate = new Date().toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${printWidthMM}mm" height="${printHeightMM}mm" viewBox="0 0 ${printWidthMM} ${printHeightMM}" xmlns="http://www.w3.org/2000/svg">
  <!-- Paper background -->
  <rect width="${printWidthMM}" height="${printHeightMM}" fill="#F5F1E8"/>
  
  <!-- Paper texture -->
  <filter id="paper-texture">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise"/>
    <feColorMatrix in="noise" type="saturate" values="0" result="desaturatedNoise"/>
    <feComponentTransfer in="desaturatedNoise" result="theNoise">
      <feFuncA type="discrete" tableValues="0 0 0 0 0 0.02 0"/>
    </feComponentTransfer>
    <feBlend in="SourceGraphic" in2="theNoise" mode="multiply"/>
  </filter>
  <rect width="${printWidthMM}" height="${printHeightMM}" fill="#F5F1E8" filter="url(#paper-texture)"/>
  
  <!-- Vignette -->
  <defs>
    <radialGradient id="vignette">
      <stop offset="30%" stop-color="rgba(0,0,0,0)"/>
      <stop offset="100%" stop-color="rgba(139,125,107,0.08)"/>
    </radialGradient>
  </defs>
  <rect width="${printWidthMM}" height="${printHeightMM}" fill="url(#vignette)"/>`;

      // Layer 1: Land mass fill
      if (geoData?.land?.features?.length > 0) {
        svg += `
  <!-- Layer 1: Land -->
  <g opacity="0.06" fill="#D4C9BA" stroke="none">`;
        geoData.land.features.forEach((feature: any) => {
          try {
            const pathData = geoJSONToSVGPath(feature, projection);
            if (pathData) {
              svg += `
    <path d="${pathData}"/>`;
            }
          } catch (e) {
            console.warn("Error rendering land:", e);
          }
        });
        svg += `
  </g>`;
      }

      // Layer 2: Lakes
      if (geoData?.lakes?.features?.length > 0) {
        svg += `
  <!-- Layer 2: Lakes -->
  <g opacity="0.12" fill="#A8C5D6" stroke="none">`;
        geoData.lakes.features.forEach((feature: any) => {
          try {
            const pathData = geoJSONToSVGPath(feature, projection);
            if (pathData) {
              svg += `
    <path d="${pathData}"/>`;
            }
          } catch (e) {
            console.warn("Error rendering lake:", e);
          }
        });
        svg += `
  </g>`;
      }

      // Layer 3: Rivers
      if (geoData?.rivers?.features?.length > 0) {
        svg += `
  <!-- Layer 3: Rivers -->
  <g opacity="0.22" stroke="#7B9CAA" stroke-width="0.35" fill="none" stroke-linecap="round">`;
        geoData.rivers.features.forEach((feature: any) => {
          try {
            const pathData = geoJSONToSVGPath(feature, projection);
            if (pathData) {
              svg += `
    <path d="${pathData}"/>`;
            }
          } catch (e) {
            console.warn("Error rendering river:", e);
          }
        });
        svg += `
  </g>`;
      }

      // Layer 4: Coastlines
      if (geoData?.coastlines?.features?.length > 0) {
        svg += `
  <!-- Layer 4: Coastlines -->
  <g opacity="0.28" stroke="#8B7D6B" stroke-width="0.55" fill="none" stroke-linecap="round" stroke-linejoin="round">`;
        geoData.coastlines.features.forEach((feature: any) => {
          try {
            const pathData = geoJSONToSVGPath(feature, projection);
            if (pathData) {
              svg += `
    <path d="${pathData}"/>`;
            }
          } catch (e) {
            console.warn("Error rendering coastline:", e);
          }
        });
        svg += `
  </g>`;
      }

      // Layer 5: Administrative borders
      if (geoData?.borders?.features?.length > 0) {
        svg += `
  <!-- Layer 5: Administrative borders -->
  <g opacity="0.15" stroke="#A39B8F" stroke-width="0.3" fill="none" stroke-dasharray="2,1" stroke-linecap="round">`;
        geoData.borders.features.forEach((feature: any) => {
          try {
            const pathData = geoJSONToSVGPath(feature, projection);
            if (pathData) {
              svg += `
    <path d="${pathData}"/>`;
            }
          } catch (e) {
            console.warn("Error rendering border:", e);
          }
        });
        svg += `
  </g>`;
      }

      // Fallback grid — only if no geo data loaded at all
      const hasAnyGeo = 
        (geoData?.coastlines?.features?.length > 0) ||
        (geoData?.land?.features?.length > 0) ||
        (geoData?.rivers?.features?.length > 0) ||
        (geoData?.lakes?.features?.length > 0) ||
        (geoData?.borders?.features?.length > 0);

      if (!hasAnyGeo) {
        console.log("Using fallback grid...");
        svg += `
  <!-- Fallback grid -->
  <g opacity="0.12" stroke="#8B7D6B" stroke-width="0.2" fill="none">`;

        for (let i = 0; i < 10; i++) {
          const lng = bbox.minLng + ((bbox.maxLng - bbox.minLng) * i) / 9;
          const top = geoToSVG(lng, bbox.maxLat);
          const bottom = geoToSVG(lng, bbox.minLat);
          svg += `
    <line x1="${top.x}" y1="${top.y}" x2="${bottom.x}" y2="${bottom.y}"/>`;
        }

        for (let i = 0; i < 8; i++) {
          const lat = bbox.minLat + ((bbox.maxLat - bbox.minLat) * i) / 7;
          const left = geoToSVG(bbox.minLng, lat);
          const right = geoToSVG(bbox.maxLng, lat);
          svg += `
    <line x1="${left.x}" y1="${left.y}" x2="${right.x}" y2="${right.y}"/>`;
        }

        svg += `
  </g>`;
      }

      // Main path
      console.log("Rendering user path...");
      
      const generatePathSegment = (p0: GeoAnchor, p2: GeoAnchor, k: number): string => {
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

      const k = CURVATURE[curvatureMode];
      let fullPath = "";
      for (let i = 0; i < geoAnchors.length - 1; i++) {
        fullPath += generatePathSegment(geoAnchors[i], geoAnchors[i + 1], k);
      }

      svg += `
  
  <!-- Main path -->
  <path d="${fullPath}" stroke="#3f3b36" stroke-width="0.75" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  
  <!-- Anchor points -->`;

      geoAnchors.forEach((anchor, index) => {
        const { x, y } = geoToSVG(anchor.lng, anchor.lat);
        const isEndpoint = index === 0 || index === geoAnchors.length - 1;
        
        if (isEndpoint) {
          svg += `
  <circle cx="${x}" cy="${y}" r="1.5" fill="#3f3b36"/>`;
        } else {
          svg += `
  <circle cx="${x}" cy="${y}" r="1.2" fill="none" stroke="#3f3b36" stroke-width="0.4"/>`;
        }
      });

      svg += `
  
  <!-- Typography -->
  <text x="${printWidthMM / 2}" y="${margin + 45}" text-anchor="middle" font-family="Georgia, serif" font-size="18" fill="#3f3b36" letter-spacing="0.5">${displayTitle}</text>
  <text x="${printWidthMM / 2}" y="${margin + 62}" text-anchor="middle" font-family="Georgia, serif" font-size="6" fill="#8B7D6B" letter-spacing="1.5">${
        origin && destination
          ? `${origin.toUpperCase()} — ${destination.toUpperCase()}`
          : origin
          ? origin.toUpperCase()
          : "ORIGIN — DESTINATION"
      }</text>
  <text x="${printWidthMM / 2}" y="${margin + 72}" text-anchor="middle" font-family="Georgia, serif" font-size="5" fill="#8B7D6B" letter-spacing="0.8">${currentYear}</text>
  <text x="${printWidthMM / 2}" y="${printHeightMM - margin - 20}" text-anchor="middle" font-family="Georgia, serif" font-size="4.5" fill="#A39B8F" letter-spacing="0.5">${geoAnchors.length} waypoints · Created ${creationDate}</text>
  
  <!-- Border frame -->
  <rect x="${margin - 5}" y="${margin - 5}" width="${printWidthMM - margin * 2 + 10}" height="${printHeightMM - margin * 2 + 10}" fill="none" stroke="#D4C9BA" stroke-width="0.3"/>
</svg>`;

      console.log("Downloading SVG...");
      
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      const filename = title
        ? `${title.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.svg`
        : `path-${new Date().toISOString().split("T")[0]}.svg`;

      link.download = filename;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log("Export successful");
    } catch (error) {
      console.error("Export error:", error);
      alert("Export failed. Please check console for details.");
    }
  };

  return (
    <main className="min-h-screen flex flex-col bg-neutral-50">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Inter:wght@300;400;500&display=swap');
        
        .font-display {
          font-family: 'Cormorant Garamond', Georgia, serif;
          font-weight: 300;
          letter-spacing: -0.02em;
        }
        
        .font-body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-weight: 300;
          letter-spacing: 0.01em;
        }
        
        .font-body-medium {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          font-weight: 400;
        }
      `}</style>
      
      <header className="border-b border-neutral-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div>
            <a href="/" className="font-display text-3xl text-neutral-900 hover:text-neutral-600 transition-colors">
              Paths
            </a>
          </div>
          <div className="font-body text-[10px] text-neutral-500 tracking-[0.2em] uppercase">
            Create
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl mb-4">
          <input
            type="text"
            value={title}
            onChange={handleTitleChange}
            placeholder="Untitled path"
            className="font-display w-full px-0 py-3 border-0 border-b-2 border-neutral-200 text-3xl text-neutral-900 placeholder:text-neutral-300 focus:outline-none focus:border-neutral-400 bg-transparent text-center transition-colors"
          />
        </div>

        <div className="w-full max-w-5xl mb-8 flex gap-4 justify-center">
          <input
            type="text"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="Origin"
            className="font-body w-48 px-3 py-2 border-0 border-b border-neutral-200 text-[13px] text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 bg-transparent text-center transition-colors uppercase tracking-wider"
          />
          <span className="text-neutral-400 self-center text-sm">—</span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Destination"
            className="font-body w-48 px-3 py-2 border-0 border-b border-neutral-200 text-[13px] text-neutral-700 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-400 bg-transparent text-center transition-colors uppercase tracking-wider"
          />
        </div>

        <div className="w-full max-w-5xl mb-8">
          <div className="flex gap-3 items-center justify-center">
            <input
              type="text"
              value={startLocation}
              onChange={(e) => setStartLocation(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && searchLocation()}
              placeholder="Search location"
              className="font-body w-80 px-4 py-2 border border-neutral-300 text-[13px] text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-500 bg-white transition-colors"
            />
            <button
              onClick={searchLocation}
              disabled={isSearching || !startLocation.trim()}
              className="font-body-medium px-6 py-2 bg-neutral-900 text-white text-[13px] hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
            >
              {isSearching ? "..." : "Go"}
            </button>
          </div>
        </div>

        <div className="w-full max-w-5xl mb-6">
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-3">
              <span className="font-body text-[10px] text-neutral-500 uppercase tracking-[0.2em]">Style</span>
              <div className="flex gap-1 border border-neutral-300 bg-white">
                {(["minimal", "subtle"] as const).map((style) => (
                  <button
                    key={style}
                    onClick={() => setMapStyle(style)}
                    className={`font-body-medium px-4 py-2 text-[10px] uppercase tracking-[0.15em] transition-all ${
                      mapStyle === style
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="font-body text-[10px] text-neutral-500 uppercase tracking-[0.2em]">Flow</span>
              <div className="flex gap-1 border border-neutral-300 bg-white">
                {(["calm", "balanced", "tension"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setCurvatureMode(mode)}
                    className={`font-body-medium px-4 py-2 text-[10px] uppercase tracking-[0.15em] transition-all ${
                      curvatureMode === mode
                        ? "bg-neutral-900 text-white"
                        : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          ref={mapContainerRef}
          className="w-full max-w-5xl h-[650px] border border-neutral-300 bg-white shadow-sm mb-8"
          style={{ cursor: isEraseMode ? "pointer" : "crosshair" }}
        />

        <div className="w-full max-w-5xl flex justify-between items-center border-t border-neutral-200 pt-8">
          <div className="flex gap-1 border border-neutral-300 bg-white">
            <button
              onClick={() => setIsEraseMode(false)}
              className={`font-body-medium flex items-center gap-2 px-5 py-2 text-[10px] uppercase tracking-[0.15em] transition-all ${
                !isEraseMode
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
              }`}
            >
              <MapPin size={13} />
              <span>Place</span>
            </button>

            <button
              onClick={() => setIsEraseMode(true)}
              className={`font-body-medium flex items-center gap-2 px-5 py-2 text-[10px] uppercase tracking-[0.15em] transition-all ${
                isEraseMode
                  ? "bg-neutral-900 text-white"
                  : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50"
              }`}
            >
              <Trash2 size={13} />
              <span>Undo</span>
            </button>
          </div>

          <div className="font-body text-[11px] text-neutral-500 tracking-[0.05em]">
            {geoAnchors.length} {geoAnchors.length === 1 ? "point" : "points"}
          </div>

          <div className="flex gap-3">
            <button
              onClick={clearPath}
              className="font-body-medium px-5 py-2 text-[10px] text-neutral-600 hover:text-neutral-900 uppercase tracking-[0.15em] transition-colors border border-neutral-300 hover:border-neutral-400 bg-white"
            >
              Clear
            </button>

            <button
              onClick={() => setShowPreview(true)}
              disabled={geoAnchors.length < 2}
              className="font-body-medium px-5 py-2 text-[10px] uppercase tracking-[0.15em] transition-all border disabled:opacity-30 disabled:cursor-not-allowed bg-white text-neutral-900 hover:bg-neutral-50 border-neutral-300"
            >
              Preview
            </button>

            <button
              onClick={exportAsPNG}
              disabled={geoAnchors.length < 2}
              className="font-body-medium px-5 py-2 text-[10px] uppercase tracking-[0.15em] transition-all border disabled:opacity-30 disabled:cursor-not-allowed bg-neutral-900 text-white hover:bg-neutral-800 border-neutral-900"
            >
              Export SVG
            </button>
          </div>
        </div>
      </div>

      {showPreview && (
        <ArtworkPreview
          anchors={geoAnchors}
          title={title}
          origin={origin}
          destination={destination}
          curvatureMode={curvatureMode}
          onClose={() => setShowPreview(false)}
          onExport={() => {
            setShowPreview(false);
            exportAsPNG();
          }}
        />
      )}
    </main>
  );
}
