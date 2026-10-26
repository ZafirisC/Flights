// Leaflet map setup.
/* global L */
export const DEFAULT_VIEW = { lat: 40.64, lon: 22.94, zoom: 8 }; // Thessaloniki

export function initMap(elementId) {
  const map = L.map(elementId, { zoomControl: false }).setView(
    [DEFAULT_VIEW.lat, DEFAULT_VIEW.lon],
    DEFAULT_VIEW.zoom,
  );
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  return map;
}
