import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Activity, Server, MapIcon, Search, Navigation } from 'lucide-react';

// === CSS para clusters con aspecto Premium CRM ===
import './MapView.css';

// === Fix Leaflet Icons Issue ===
// In React, default leaflet icons get broken paths. We use custom SVGs.
const createCustomIcon = (isOnline, isSelected) => {
    const color = isOnline ? '#22c55e' : '#ef4444';

    // Solo mostramos la onda de animación si el punto está seleccionado (clickeado)
    const animationHtml = isSelected
        ? `<div class="absolute inset-0 rounded-full opacity-40 animate-ping shadow-lg" style="background-color: ${color}; animation-duration: 2.5s;"></div>`
        : '';

    // Removido el efecto hover y scale para hacerlo estático y sólido
    const svgIcon = `
    <div class="relative flex items-center justify-center w-12 h-12 cursor-pointer drop-shadow-md">
        ${animationHtml}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="relative z-10 w-10 h-10 transition-colors duration-300">
            <path fill="${color}" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
    </div>`;

    return L.divIcon({
        className: 'bg-transparent border-none outline-none', // Override default leaflet background
        html: svgIcon,
        iconSize: [48, 48],
        iconAnchor: [24, 44],
        popupAnchor: [0, -40],
    });
};

// Component to dynamically fit bounds if we have points
const MapBoundsFitter = ({ points }) => {
    const map = useMap();
    // Creamos un string único para evitar que map.fitBounds se arroje en Background-refetches o clicks.
    const pointsHash = points.map(p => p.id || p.ip).join(',');

    useEffect(() => {
        const validPoints = points.filter(p => p.lat != null && p.lng != null);
        if (validPoints.length > 0) {
            const bounds = L.latLngBounds(validPoints.map(p => [p.lat, p.lng]));
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
    }, [pointsHash, map]); // <--- Solo auto-centrar cuando el arreglo real de pines cambie

    return null;
};

// Component to handle global map clicks (to clear selection)
const MapEvents = ({ onMapClick }) => {
    useMapEvents({
        click: () => onMapClick(),
    });
    return null;
};

export default function MapView({ points, focusedZone, onClearFocus, onUpdatePointLocation }) {
    const [activeMarkerId, setActiveMarkerId] = useState(null);
    // Valle del Cauca, Colombia default center
    const DEFAULT_CENTER = [3.4516, -76.5320];
    const DEFAULT_ZOOM = 9;

    const mapPoints = useMemo(() => {
        return focusedZone ? points.filter(p => p.segment === focusedZone) : points;
    }, [points, focusedZone]);

    const validPoints = useMemo(() => {
        return mapPoints.filter(p => p.lat != null && p.lng != null);
    }, [mapPoints]);

    if (!points || points.length === 0) {
        return (
            <div className="w-full h-full min-h-[500px] flex-1 rounded-xl overflow-hidden border border-border/80 flex items-center justify-center bg-card/40">
                <p className="text-muted-foreground">Cargando puntos...</p>
            </div>
        );
    }

    return (
        <div className="w-full h-[calc(100vh-240px)] min-h-[500px] rounded-xl overflow-hidden border border-border/80 shadow-sm relative z-0">
            <MapContainer
                center={DEFAULT_CENTER}
                zoom={DEFAULT_ZOOM}
                className="w-full h-full z-0"
                style={{ background: '#0f172a' }} // Dark theme fallback
            >
                {/* CartoDB Dark Matter Base Map for a modern dashboard look */}
                <TileLayer
                    url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                <MapEvents onMapClick={() => setActiveMarkerId(null)} />
                <MapBoundsFitter points={validPoints} />

                <MarkerClusterGroup
                    chunkedLoading
                    showCoverageOnHover={false}
                    maxClusterRadius={40}
                >
                    {validPoints.map(point => {
                        const pointId = point.id || point.ip;
                        const isDraggable = true; // Por ahora todos movibles o sujeto a permisos

                        return (
                            <Marker
                                key={pointId}
                                position={[point.lat, point.lng]}
                                icon={createCustomIcon(point.active, activeMarkerId === pointId)}
                                draggable={isDraggable}
                                eventHandlers={{
                                    click: () => setActiveMarkerId(pointId),
                                    dragend: (e) => {
                                        const newPos = e.target.getLatLng();
                                        if (onUpdatePointLocation) {
                                            if (window.confirm(`¿Confirmas mover a ${point.name} a esta nueva ubicación geoespacial?`)) {
                                                onUpdatePointLocation(point.id, newPos.lat, newPos.lng);
                                            } else {
                                                // Revertir
                                                e.target.setLatLng([point.lat, point.lng]);
                                            }
                                        }
                                    }
                                }}
                            >
                                <Tooltip direction="top" offset={[0, -20]} opacity={1} className="skylab-tooltip">
                                    {point.name || point.alias}
                                </Tooltip>
                                <Popup className="skylab-custom-popup" onClose={() => setActiveMarkerId(null)}>
                                    <div className="p-1 min-w-[200px]">
                                        <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-200/20">
                                            <div className="flex items-center gap-2">
                                                <Server className={`w-4 h-4 ${point.active ? 'text-green-500' : 'text-red-500'}`} />
                                                <span className="font-bold text-gray-800 dark:text-gray-100">{point.name || point.alias}</span>
                                            </div>
                                            <Navigation className="w-3 h-3 text-muted-foreground opacity-50" title="Arrastrable" />
                                        </div>
                                        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">IP:</span>
                                                <span className="font-mono">{point.ip}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Zona:</span>
                                                <span>{point.segment}</span>
                                            </div>
                                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200/20">
                                                <span className="flex items-center gap-1">
                                                    <Activity className="w-3 h-3" /> Latencia
                                                </span>
                                                <span className={`font-mono font-medium ${point.active ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>
                                                    {point.active && point.latency ? `${point.latency}ms` : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MarkerClusterGroup>
            </MapContainer>
        </div>
    );
}
