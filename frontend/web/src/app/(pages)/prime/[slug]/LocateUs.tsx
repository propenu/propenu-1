"use client";

import { LOCATION_ICON_PATH, LOCATION_ICON_VIEWBOX } from "@/icons/icons";
import { getMapplsGlobal, loadMapplsScript } from "@/lib/mappls";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiCheck } from "react-icons/fi";

type NearbyPlace = {
  name?: string;
  type?: string;
  distanceText?: string;
  coordinates?: [number, number] | number[];
  order?: number;
};

type GeoPoint = {
  type: "Point";
  coordinates?: [number, number] | number[];
};

type LocatePayload = {
  nearbyPlaces?: NearbyPlace[] | null;
  location?: GeoPoint | null;
  color?: string | null;
  heading?: string | null;
};

type Props = {
  nearbyPlaces?: NearbyPlace[] | LocatePayload | null;
  primaryColor?: string | null;
  location?: GeoPoint | null;
  heading?: string | null;
};

type MapplsPosition = { lat: number; lng: number };

type MapplsMarkerOptions = {
  map: unknown;
  position: MapplsPosition;
  icon?: string;
  width?: number;
  height?: number;
  popupHtml?: string;
  fitbounds?: boolean;
};

type MapplsMapOptions = {
  center: [number, number];
  zoom: number;
  zoomControl?: boolean;
  location?: boolean;
};

type MapplsMapInstance = {
  remove?: () => void;
  fitBounds?: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void;
  setCenter?: (center: [number, number]) => void;
  panTo?: (position: MapplsPosition) => void;
  flyTo?: (options: { center: [number, number]; zoom?: number }) => void;
  setZoom?: (zoom: number) => void;
};

type MapplsGlobal = {
  Map: new (element: string | HTMLElement, options: MapplsMapOptions) => MapplsMapInstance;
  Marker: new (options: MapplsMarkerOptions) => unknown;
};

type MarkerRefItem = {
  marker: unknown;
  coords: [number, number];
  listIndex: number | null;
};

type MapplsMarkerInstance = {
  remove?: () => void;
  setMap?: (map: unknown) => void;
  on?: (event: string, cb: () => void) => void;
  addListener?: (event: string, cb: () => void) => void;
  openPopup?: () => void;
};

function haversine([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function normalizeCoords(coords?: [number, number] | number[]): [number, number] | undefined {
  if (!coords || !Array.isArray(coords) || coords.length < 2) return undefined;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return undefined;
  return [lng, lat];
}

function normalizeIncoming(
  incoming?: NearbyPlace[] | LocatePayload | null,
  explicitLocation?: GeoPoint | null,
  explicitColor?: string | null,
  explicitHeading?: string | null
) {
  if (Array.isArray(incoming)) {
    return {
      places: incoming as NearbyPlace[],
      location: explicitLocation ?? null,
      color: explicitColor ?? "#F59E0B",
      heading: explicitHeading ?? "Locate Us",
    };
  }

  const p = (incoming || {}) as LocatePayload;
  return {
    places: Array.isArray(p.nearbyPlaces) ? p.nearbyPlaces : [],
    location: explicitLocation ?? p.location ?? null,
    color: explicitColor ?? p.color ?? "#F59E0B",
    heading: explicitHeading ?? p.heading ?? "Locate Us",
  };
}

function createMarkerIconDataUrl(colorHex: string, size = 32, useProjectIcon = false) {
  const svgMarkup = useProjectIcon
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${LOCATION_ICON_VIEWBOX}"><path fill="${colorHex}" d="${LOCATION_ICON_PATH}"/></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M16 3.5C10.75 3.5 6.5 7.75 6.5 13c0 6.94 7.39 13.34 8.93 14.59a.9.9 0 0 0 1.14 0C18.11 26.34 25.5 19.94 25.5 13c0-5.25-4.25-9.5-9.5-9.5Z" fill="${colorHex}"/><path d="M16 5.25c4.28 0 7.75 3.47 7.75 7.75 0 5.37-5.3 10.87-7.75 12.99-2.45-2.12-7.75-7.62-7.75-12.99 0-4.28 3.47-7.75 7.75-7.75Z" fill="#ffffff" fill-opacity="0.18"/><circle cx="16" cy="13" r="4.25" fill="#ffffff"/><circle cx="16" cy="13" r="2.1" fill="${colorHex}"/></svg>`;
  const svg = encodeURIComponent(svgMarkup);
  return `data:image/svg+xml;utf8,${svg}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function removeMarker(map: MapplsMapInstance | null, marker: unknown) {
  const markerAny = marker as {
    remove?: () => void;
    setMap?: (map: unknown) => void;
  };

  if (typeof markerAny.remove === "function") {
    markerAny.remove();
    return;
  }

  if (typeof markerAny.setMap === "function") {
    markerAny.setMap(null);
    return;
  }

  const mapAny = map as { removeLayer?: (layer: unknown) => void } | null;
  if (mapAny && typeof mapAny.removeLayer === "function") {
    mapAny.removeLayer(marker);
  }
}

function cleanupMarkerInstances(map: MapplsMapInstance | null, markers: MarkerRefItem[]) {
  markers.forEach((item) => {
    try {
      removeMarker(map, item.marker);
    } catch {
      // Ignore SDK cleanup issues; markers are recreated from current data.
    }
  });
}

function focusMapOn(map: MapplsMapInstance | null, coords: [number, number]) {
  if (!map) return;

  const [lng, lat] = coords;
  if (typeof map.panTo === "function") {
    map.panTo({ lat, lng });
    return;
  }

  if (typeof map.flyTo === "function") {
    map.flyTo({ center: [lat, lng], zoom: 14 });
    return;
  }

  if (typeof map.setCenter === "function") {
    map.setCenter([lat, lng]);
  }
}

export default function LocateUs({ nearbyPlaces: raw, primaryColor, location: explicitLocation, heading: headingProp }: Props) {
  const { places, location, color } = useMemo(
    () => normalizeIncoming(raw, explicitLocation ?? null, primaryColor ?? null, headingProp ?? null),
    [raw, primaryColor, explicitLocation, headingProp]
  );

  const apiKey = process.env.NEXT_PUBLIC_MAPPLS_MAP_SDK_KEY || process.env.NEXT_MAPPLS_MAP_SDK_KEY;
  const mapContainerId = "locate-us-mappls-map";
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<MapplsMapInstance | null>(null);
  const markersRef = useRef<MarkerRefItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const projectCenter = useMemo(() => {
    if (!location) return undefined;
    return normalizeCoords(location.coordinates);
  }, [location]);

  const normalizedPlaces = useMemo(
    () => (Array.isArray(places) ? places.map((p) => ({ ...p, __coordsTuple: normalizeCoords(p.coordinates) })) : []),
    [places]
  );

  const withDistance = useMemo(() => {
    return normalizedPlaces.map((item) => {
      const coords = (item as NearbyPlace & { __coordsTuple?: [number, number] }).__coordsTuple;
      const savedDistanceText = item.distanceText?.trim();

      if (!projectCenter || !coords) {
        return { p: item as NearbyPlace, distance: undefined, distanceText: savedDistanceText };
      }

      if (savedDistanceText) {
        return { p: item as NearbyPlace, distance: undefined, distanceText: savedDistanceText, coords };
      }

      const meters = haversine(projectCenter, coords);
      const dt = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
      return { p: item as NearbyPlace, distance: meters, distanceText: dt, coords };
    });
  }, [normalizedPlaces, projectCenter]);

  useEffect(() => {
    let isCancelled = false;

    const initMap = async () => {
      if (!apiKey) {
        setMapError("Mappls API key is missing. Set NEXT_PUBLIC_MAPPLS_MAP_SDK_KEY in .env.");
        return;
      }

      if (!mapRef.current) return;

      try {
        setMapError(null);
        await loadMapplsScript(apiKey);
        if (isCancelled) return;

        const mapplsSdk = getMapplsGlobal<MapplsGlobal>();
        if (!mapplsSdk || !mapRef.current || mapInstanceRef.current) {
          throw new Error("Mappls SDK loaded but API object is unavailable.");
        }

        const mapContainer = document.getElementById(mapContainerId);
        if (!mapContainer) {
          throw new Error("Map Container div not found, please check timing of your map div initialization");
        }

        mapRef.current.replaceChildren();

        mapInstanceRef.current = new mapplsSdk.Map(mapContainerId, {
          center: projectCenter ? [projectCenter[1], projectCenter[0]] : [20.5937, 78.9629],
          zoom: projectCenter ? 13 : 4,
          zoomControl: true,
          location: false,
        });

        const map = mapInstanceRef.current;
        if (!map) {
          throw new Error("Mappls map instance was not created.");
        }

        const renderMarkers = () => {
          cleanupMarkerInstances(map, markersRef.current);
          markersRef.current = [];

          if (projectCenter) {
            const [lng, lat] = projectCenter;
            const mainMarker = new mapplsSdk.Marker({
              map,
              position: { lat, lng },
              icon: createMarkerIconDataUrl(color, 36, true),
              width: 36,
              height: 36,
              popupHtml: "<strong>Project location</strong>",
            });

            markersRef.current.push({ marker: mainMarker, coords: projectCenter, listIndex: null });
          }

          for (let i = 0; i < withDistance.length; i++) {
            const item = withDistance[i];
            const coords = (item as { coords?: [number, number] }).coords;
            if (!coords) continue;

            const [lng, lat] = coords;
            const marker = new mapplsSdk.Marker({
              map,
              position: { lat, lng },
              icon: createMarkerIconDataUrl(color, 32, false),
              width: 32,
              height: 32,
              popupHtml: `<div style="font-weight:600">${escapeHtml(item.p.name ?? "Place")}</div><div style="font-size:12px;color:#444;margin-top:4px">${escapeHtml(item.p.type ?? "")} - ${escapeHtml(item.distanceText ?? "")}</div>`,
            });

            const markerAny = marker as MapplsMarkerInstance;
            if (typeof markerAny.on === "function") markerAny.on("click", () => setSelectedIndex(i));
            if (typeof markerAny.addListener === "function") markerAny.addListener("click", () => setSelectedIndex(i));

            markersRef.current.push({ marker, coords, listIndex: i });
          }

          if (projectCenter) {
            focusMapOn(map, projectCenter);
            if (typeof map.setZoom === "function") map.setZoom(14);
          } else {
            const firstMarkerCoords = markersRef.current[0]?.coords;
            if (firstMarkerCoords) {
              focusMapOn(map, firstMarkerCoords);
              if (typeof map.setZoom === "function") map.setZoom(14);
            }
          }
        };

        const mapAny = map as {
          getCanvasContainer?: () => unknown;
          on?: (event: string, cb: () => void) => void;
          addListener?: (event: string, cb: () => void) => void;
        };

        if (typeof mapAny.getCanvasContainer === "function") {
          renderMarkers();
        } else if (typeof mapAny.on === "function") {
          mapAny.on("load", renderMarkers);
        } else if (typeof mapAny.addListener === "function") {
          mapAny.addListener("load", renderMarkers);
        } else {
          setTimeout(renderMarkers, 200);
        }
        setMapReady(true);
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : "Unable to load Mappls map right now.";
          setMapError(message);
          console.error("Mappls init error:", error);
        }
      }
    };

    initMap();

    return () => {
      isCancelled = true;
      cleanupMarkerInstances(mapInstanceRef.current, markersRef.current);
      markersRef.current = [];
      mapInstanceRef.current = null;
      setMapReady(false);
    };
  }, [apiKey, color, mapContainerId, projectCenter, withDistance]);

  useEffect(() => {
    if (!mapReady || selectedIndex === null) return;

    const map = mapInstanceRef.current;
    const markerItem = markersRef.current.find((m) => m.listIndex === selectedIndex);
    if (!markerItem) return;

    const markerAny = markerItem.marker as MapplsMarkerInstance;
    if (typeof markerAny.openPopup === "function") {
      markerAny.openPopup();
    }

    focusMapOn(map, markerItem.coords);
  }, [mapReady, selectedIndex]);

  useEffect(() => {
    return () => {
      cleanupMarkerInstances(mapInstanceRef.current, markersRef.current);
      markersRef.current = [];
      mapInstanceRef.current = null;
    };
  }, []);

  function onSelectPlace(index: number) {
    setSelectedIndex(index);
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div style={{ color, borderLeft: `5px solid ${color}` }}>
          <div className="ml-2">
            <h1 className="text-[20px] font-bold lg:text-2xl md:text-4xl">{"Location Advantages"}</h1>
            <p className="headingDesc text-xs lg:text-base md:text-lg">Find important locations around your property</p>
          </div>
        </div>
      </div>

      <div className="w-full">
        <div className="sm:p-2">

          <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {withDistance.length === 0 && (
              <li className="text-sm text-slate-500">No nearby places provided.</li>
            )}

            {withDistance.map(({ p }, idx) => {
              const active = selectedIndex === idx;

              return (
                <li
                  key={`${p.name ?? "place"}-${idx}`}
                  className={`rounded-md border bg-white px-2.5 py-2 transition sm:rounded-lg sm:px-3.5 sm:py-2.5 ${
                    active ? "ring-1 ring-offset-1" : ""
                  }`}
                  style={{
                    borderColor: active ? color : "#e2e8f0",
                    boxShadow: active ? `0 4px 12px ${color}1f` : undefined,
                  } as React.CSSProperties}
                >
                  <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border sm:h-[22px] sm:w-[22px]"
                        style={{ borderColor: color, color }}
                      >
                        <FiCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </span>

                      <div className="truncate text-xs font-semibold text-slate-950 sm:text-sm">
                        {p.name?.split(",")[0] ?? "Nearby place"}
                      </div>
                    </div>

                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-lg overflow-hidden border border-slate-100 shadow-sm">
          {mapError ? (
            <div className="flex h-[420px] w-full items-center justify-center px-4 text-center text-slate-500 sm:h-[500px] md:h-[560px] lg:h-[520px]">
              {mapError}
            </div>
          ) : (
            <div id={mapContainerId} ref={mapRef} className="h-[420px] w-full sm:h-[500px] md:h-[560px] lg:h-[420px]" />
          )}
        </div>
        <div className="mt-3 text-xs text-slate-500">Click markers to open details.</div>
      </div>
    </section>
  );
}




