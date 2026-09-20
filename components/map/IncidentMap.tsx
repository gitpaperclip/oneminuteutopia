'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  ZoomControl,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import type { IncidentBbox } from '@/lib/map-incident-types';
import { isEmergencyIncident, type MappableIncident } from '@/components/map/incidents';
import 'leaflet/dist/leaflet.css';
import './incident-map.css';

const BALTIMORE: [number, number] = [39.2904, -76.6122];

interface UserPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const USER_LOCATION_ICON = L.divIcon({
  className: 'user-location-pin',
  iconSize: [36, 44],
  iconAnchor: [18, 40],
  html: `
    <span class="user-location-pin-label">You</span>
    <svg class="user-location-pin-shape" viewBox="0 0 36 44" aria-hidden="true">
      <path d="M18 42C15 36.7 5 27 5 18a13 13 0 1 1 26 0c0 9-10 18.7-13 24Z" />
      <circle cx="18" cy="18" r="5" />
    </svg>
  `,
});

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

function UserLocation({
  position,
  focusVersion,
}: {
  position: UserPosition | null;
  focusVersion: number;
}) {
  const map = useMap();
  const handledFocusVersion = useRef(-1);

  useEffect(() => {
    if (!position || handledFocusVersion.current === focusVersion) return;
    map.flyTo(
      [position.latitude, position.longitude],
      Math.max(map.getZoom(), 15),
      { animate: true, duration: 0.7 },
    );
    handledFocusVersion.current = focusVersion;
  }, [focusVersion, map, position]);

  if (!position) return null;

  const center: [number, number] = [position.latitude, position.longitude];
  return (
    <>
      <Circle
        center={center}
        radius={Math.min(Math.max(position.accuracy, 10), 1000)}
        interactive={false}
        pathOptions={{
          color: '#2563eb',
          fillColor: '#60a5fa',
          fillOpacity: 0.14,
          opacity: 0.5,
          weight: 1,
        }}
      />
      <Marker
        position={center}
        icon={USER_LOCATION_ICON}
        title="Your location"
        zIndexOffset={1000}
        interactive={false}
        keyboard={false}
      />
    </>
  );
}

function LocationIcon({ busy }: { busy: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      className={busy ? 'map-location-icon is-busy' : 'map-location-icon'}
    >
      <circle cx="12" cy="12" r="4" fill="currentColor" />
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
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
  const geolocationAvailable = typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [locationError, setLocationError] = useState<string | null>(
    geolocationAvailable ? null : 'Location is unavailable in this browser.',
  );
  const [locating, setLocating] = useState(geolocationAvailable);
  const [locationRequest, setLocationRequest] = useState(0);
  const [focusVersion, setFocusVersion] = useState(0);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        });
        setLocating(false);
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? 'Allow location access to show where you are.'
            : 'Your location could not be found.',
        );
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 10_000 },
    );
  }, [locationRequest]);

  const focusLocation = () => {
    if (position) {
      setFocusVersion((version) => version + 1);
      return;
    }
    setLocating(true);
    setLocationError(null);
    setLocationRequest((request) => request + 1);
  };

  const locationLabel = position
    ? 'Center map on my location'
    : locating
      ? 'Finding your location'
      : 'Show my location';

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
        <UserLocation position={position} focusVersion={focusVersion} />
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
      <div className="map-location-control">
        {locationError ? (
          <p className="map-location-message" role="status">{locationError}</p>
        ) : null}
        <button
          type="button"
          className="map-location-button"
          aria-label={locationLabel}
          title={locationLabel}
          disabled={locating}
          onClick={focusLocation}
        >
          <LocationIcon busy={locating} />
        </button>
      </div>
    </div>
  );
}
