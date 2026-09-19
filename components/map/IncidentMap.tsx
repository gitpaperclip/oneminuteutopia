'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import type { IncidentBbox } from '@/lib/map-incident-types';
import { isEmergencyIncident, type MappableIncident } from '@/components/map/incidents';
import 'leaflet/dist/leaflet.css';
import './incident-map.css';

const BALTIMORE: [number, number] = [39.2904, -76.6122];

function pinIcon(incident: MappableIncident, selected: boolean): L.DivIcon {
  const emergency = isEmergencyIncident(incident);
  const size = selected ? 34 : incident.is_super_report ? 28 : 22;
  const color = emergency ? '#dc2626' : incident.is_super_report ? '#d97706' : '#2563eb';
  const count = incident.is_super_report
    ? `<span class="incident-pin-count">${incident.evidence_count}</span>`
    : '';
  const classes = [
    'incident-pin',
    emergency ? 'incident-pin-pulse' : '',
    selected ? 'incident-pin-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return L.divIcon({
    className: classes,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<span class="incident-pin-dot" style="width:${size}px;height:${size}px;background:${color}"></span>${count}`,
  });
}

function boundsFromMap(map: L.Map): IncidentBbox {
  const bounds = map.getBounds();
  return {
    minLat: bounds.getSouth(),
    maxLat: bounds.getNorth(),
    minLon: bounds.getWest(),
    maxLon: bounds.getEast(),
  };
}

function BoundsSync({ onBounds }: { onBounds: (bbox: IncidentBbox) => void }) {
  const map = useMap();
  useEffect(() => {
    onBounds(boundsFromMap(map));
  }, [map, onBounds]);
  useMapEvents({
    moveend: () => onBounds(boundsFromMap(map)),
    zoomend: () => onBounds(boundsFromMap(map)),
  });
  return null;
}

function MapClicks({ onDeselect }: { onDeselect: () => void }) {
  useMapEvents({ click: onDeselect });
  return null;
}

export default function IncidentMap({
  incidents,
  selectedId,
  onSelect,
  onBounds,
}: {
  incidents: MappableIncident[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBounds: (bbox: IncidentBbox) => void;
}) {
  return (
    <div className="incident-map">
      <MapContainer
        center={BALTIMORE}
        zoom={12}
        scrollWheelZoom
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ZoomControl position="bottomright" />
        <BoundsSync onBounds={onBounds} />
        <MapClicks onDeselect={() => onSelect(null)} />
        {incidents.map((incident) => (
          <Marker
            key={incident.id}
            position={[incident.latitude, incident.longitude]}
            icon={pinIcon(incident, incident.id === selectedId)}
            title={incident.short_label}
            eventHandlers={{
              click: (event) => {
                L.DomEvent.stopPropagation(event.originalEvent);
                onSelect(incident.id);
              },
            }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
