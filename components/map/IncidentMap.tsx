'use client';

import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  GeolocateControl,
  Map as MapLibreMap,
  NavigationControl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from 'maplibre-gl';
import type { IncidentBbox } from '@/lib/map-incident-types';
import { incidentsToGeoJSON, pointColorExpression } from '@/lib/map-geojson';
import { isEmergencyIncident, type MappableIncident } from '@/components/map/incidents';
import 'maplibre-gl/dist/maplibre-gl.css';
import './incident-map.css';

const BALTIMORE: [number, number] = [-76.6122, 39.2904];
const SOURCE_ID = 'incidents';
const CLUSTER_LAYER = 'incident-clusters';
const CLUSTER_COUNT_LAYER = 'incident-cluster-count';
const POINT_LAYER = 'incident-points';
const SELECTED_LAYER = 'incident-selected';

function boundsFromMap(map: MapLibreMap): IncidentBbox {
  const bounds = map.getBounds();
  return {
    minLat: bounds.getSouth(),
    maxLat: bounds.getNorth(),
    minLon: bounds.getWest(),
    maxLon: bounds.getEast(),
  };
}

export default function IncidentMap({
  styleUrl,
  incidents,
  selectedId,
  onSelect,
  onBounds,
  locateRef,
}: {
  styleUrl: string;
  incidents: MappableIncident[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBounds: (bbox: IncidentBbox) => void;
  locateRef?: MutableRefObject<(() => void) | null>;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelect);
  const onBoundsRef = useRef(onBounds);
  const readyRef = useRef(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
    onBoundsRef.current = onBounds;
  }, [onBounds, onSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      center: BALTIMORE,
      zoom: 12,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    const geolocate = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showAccuracyCircle: false,
    });
    map.addControl(geolocate, 'bottom-right');
    if (locateRef) locateRef.current = () => geolocate.trigger();

    const emitBounds = () => onBoundsRef.current(boundsFromMap(map));

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: incidentsToGeoJSON([], isEmergencyIncident),
        cluster: true,
        clusterMaxZoom: 15,
        clusterRadius: 48,
        clusterProperties: {
          evidence_sum: ['+', ['get', 'evidence_count']],
        },
      });
      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1f2937',
          'circle-radius': ['step', ['get', 'point_count'], 16, 8, 20, 25, 26],
          'circle-opacity': 0.92,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
        },
      });
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['to-string', ['get', 'point_count']],
          'text-size': 12,
        },
        paint: { 'text-color': '#fff' },
      });
      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': pointColorExpression() as ExpressionSpecification,
          'circle-radius': [
            'case',
            ['==', ['get', 'is_super_report'], 1],
            11,
            8,
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.95,
        },
      });
      map.addLayer({
        id: SELECTED_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 16,
          'circle-color': 'transparent',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#2563eb',
        },
      });
      readyRef.current = true;
      emitBounds();
    });

    map.on('moveend', emitBounds);
    map.on('zoomend', emitBounds);

    map.on('click', CLUSTER_LAYER, (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry.type !== 'Point') return;
      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (typeof clusterId !== 'number' || !source) return;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        map.easeTo({
          center: feature.geometry.type === 'Point'
            ? (feature.geometry.coordinates as [number, number])
            : map.getCenter(),
          zoom,
        });
      }).catch(() => undefined);
    });

    map.on('click', POINT_LAYER, (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id === 'string') onSelectRef.current(id);
    });

    map.on('click', (event: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [CLUSTER_LAYER, POINT_LAYER].filter((layer) => map.getLayer(layer)),
      });
      if (hits.length === 0) onSelectRef.current(null);
    });

    map.on('mouseenter', CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseenter', POINT_LAYER, () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', CLUSTER_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('mouseleave', POINT_LAYER, () => {
      map.getCanvas().style.cursor = '';
    });

    mapRef.current = map;
    return () => {
      if (locateRef) locateRef.current = null;
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [locateRef, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(incidentsToGeoJSON(incidents, isEmergencyIncident));
  }, [incidents]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer(SELECTED_LAYER)) return;
    map.setFilter(SELECTED_LAYER, ['==', ['get', 'id'], selectedId ?? '']);
  }, [selectedId, incidents]);

  return <div ref={containerRef} className="incident-map" />;
}
