'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef } from 'react';

const NIGERIA: L.LatLngTuple = [9.08, 8.68];

/**
 * Optional map pin (Leaflet + OpenStreetMap): tap the map to place or move the pin.
 * Loaded only when the teacher opens it, so the map code never weighs down the page.
 * A circle marker is used because Leaflet's image markers need extra asset wiring.
 */
export default function MapPin({
  value,
  onChange,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (value: { lat: number; lng: number }) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  useEffect(() => {
    const map = L.map(el.current!, { scrollWheelZoom: false }).setView(value ? [value.lat, value.lng] : NIGERIA, value ? 15 : 6);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    const place = (latlng: L.LatLng) => {
      marker.current ??= L.circleMarker(latlng, { radius: 9, color: '#047857', fillOpacity: 0.8 }).addTo(map);
      marker.current.setLatLng(latlng);
    };
    if (value) place(L.latLng(value.lat, value.lng));
    map.on('click', (e: L.LeafletMouseEvent) => {
      place(e.latlng);
      changed.current({ lat: Number(e.latlng.lat.toFixed(6)), lng: Number(e.latlng.lng.toFixed(6)) });
    });
    return () => {
      marker.current = null;
      map.remove();
    };
    // The map is created once; later value changes come from the map itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={el} className="h-64 w-full rounded-lg border border-slate-300" aria-label="Map: tap to place your pin" />;
}
