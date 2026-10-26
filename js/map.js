// Leaflet map setup. Opens at the last view (localStorage), else Thessaloniki.
/* global L */
import { load, save } from './storage.js';

export const DEFAULT_VIEW = { lat: 40.64, lon: 22.94, zoom: 8 }; // Thessaloniki

export function initMap(elementId) {
  const saved = load('view');
  const view = saved && [saved.lat, saved.lon, saved.zoom].every(Number.isFinite) ? saved : DEFAULT_VIEW;
  const map = L.map(elementId, { zoomControl: false }).setView([view.lat, view.lon], view.zoom);
  map.on('moveend', () => {
    const c = map.getCenter();
    save('view', { lat: +c.lat.toFixed(4), lon: +c.lng.toFixed(4), zoom: map.getZoom() });
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  return map;
}
