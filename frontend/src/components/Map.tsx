import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useState, useRef } from "react";
import L, { LeafletMouseEvent } from "leaflet";
import { FaVideo, FaCar, FaMap } from "react-icons/fa";
import { renderToString } from "react-dom/server";

// สร้างไอคอนกล้อง
const createCameraIcon = (cameraNumber: string) => {
  return L.divIcon({
    className: "custom-icon",
    html: renderToString(
      <div className="flex flex-col items-center">
        <FaVideo className="text-blue-500 text-2xl" />
        <span className="text-sm font-bold">{cameraNumber}</span>
      </div>
    ),
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
};

// สร้างไอคอนรถ
const createCarIcon = () => {
  return L.divIcon({
    className: "custom-icon",
    html: renderToString(
      <div className="flex items-center">
        <FaCar className="text-red-500 text-2xl" />
      </div>
    ),
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
};

// สร้างไอคอนด่าน
const createCheckpointIcon = () => {
  try {
    return L.icon({
      iconUrl: "https://project-police-cctv2.vercel.app/checkpoint.png",
      iconSize: [51, 51],
      iconAnchor: [25.5, 51],
      popupAnchor: [0, -51],
    });
  } catch (error) {
    console.warn("Failed to load checkpoint.png, using fallback icon", error);
    return L.divIcon({
      className: "custom-icon",
      html: renderToString(
        <div className="flex flex-col items-center">
          <FaMap className="text-green-500 text-2xl" />
          <span className="text-sm font-bold">Checkpoint</span>
        </div>
      ),
      iconSize: [40, 40],
      iconAnchor: [20, 40],
      popupAnchor: [0, -40],
    });
  }
};

interface PassHistory {
  id: number;
  plate: string;
  cameraId: number;
  cameraName: string;
  timestamp: string;
  location: [number, number];
  camera_location: string;
}

export interface MapProps {
  center: [number, number];
  cameras: Record<number, [number, number]>;
  carHistory: PassHistory[];
  showCarMarkers?: boolean;
  showRoute?: boolean;
  checkpoints?: [number, number][];
  onCheckpointAdd?: (position: [number, number]) => void;
  onCheckpointRemove?: (position: [number, number]) => void;
  initialMapType?: "road" | "satellite" | "terrain";
}

function UpdateMapCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

function MapEvents({ onCheckpointAdd, isClickValid }: { onCheckpointAdd?: (position: [number, number]) => void; isClickValid: boolean }) {
  useMapEvents({
    click: (e: LeafletMouseEvent) => {
      if (onCheckpointAdd && isClickValid) {
        const target = e.originalEvent.target as HTMLElement;
        const isInControls = !!target.closest('.map-controls-container');
        
        if (!isInControls) {
          const newPosition: [number, number] = [e.latlng.lat, e.latlng.lng];
          onCheckpointAdd(newPosition);
        }
      }
    },
  });
  return null;
}

function MapControls({ onMapTypeChange, currentMapType, setIsClickValid }: { onMapTypeChange: (type: "road" | "satellite" | "terrain") => void; currentMapType: "road" | "satellite" | "terrain"; setIsClickValid: (valid: boolean) => void }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);

  const handleMapTypeChange = (type: "road" | "satellite" | "terrain") => {
    onMapTypeChange(type);
    setIsMenuOpen(false);
  };

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsMenuOpen(!isMenuOpen);
    setIsClickValid(false);
  };

  const handleOptionClick = (type: "road" | "satellite" | "terrain") => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    handleMapTypeChange(type);
    setIsClickValid(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setIsClickValid(true);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [setIsClickValid]);

  return (
    <div ref={buttonRef} className="map-controls-container absolute top-4 left-4 z-[1000]">
      <div className="relative">
        <button
          onClick={handleButtonClick}
          className="flex items-center bg-white text-gray-700 px-3 py-2 rounded-full shadow-md hover:bg-gray-100 transition-colors duration-200"
        >
          <FaMap className="mr-2 text-lg" />
          <span className="text-sm font-medium">ประเภทแผนที่</span>
        </button>

        {isMenuOpen && (
          <div className="absolute top-12 left-0 w-40 bg-white rounded-lg shadow-lg z-[1000] transition-all duration-200 ease-in-out">
            <button
              onClick={handleOptionClick("road")}
              className={`w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-t-lg transition-colors duration-200 ${
                currentMapType === "road" ? "bg-gray-100 font-semibold" : ""
              }`}
            >
              แผนที่ถนน
            </button>
            <button
              onClick={handleOptionClick("satellite")}
              className={`w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200 ${
                currentMapType === "satellite" ? "bg-gray-100 font-semibold" : ""
              }`}
            >
              ดาวเทียม
            </button>
            <button
              onClick={handleOptionClick("terrain")}
              className={`w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-b-lg transition-colors duration-200 ${
                currentMapType === "terrain" ? "bg-gray-100 font-semibold" : ""
              }`}
            >
              ภูมิประเทศ
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Map({
  center,
  cameras,
  carHistory,
  showCarMarkers = true,
  showRoute = true,
  checkpoints = [],
  onCheckpointAdd,
  onCheckpointRemove,
  initialMapType = "road",
}: MapProps) {
  const [mapType, setMapType] = useState<"road" | "satellite" | "terrain">(initialMapType);
  const [isClickValid, setIsClickValid] = useState(true);

  const sortedCarHistory = [...carHistory].sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  const getTileLayerUrl = () => {
    switch (mapType) {
      case "satellite":
        return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
      case "terrain":
        return "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
      case "road":
      default:
        return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    }
  };

  const getAttribution = () => {
    switch (mapType) {
      case "satellite":
        return '© <a href="https://www.arcgis.com">ArcGIS</a>';
      case "terrain":
        return '© <a href="https://opentopomap.org">OpenTopoMap</a>';
      case "road":
      default:
        return '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
    }
  };

  return (
    <div className="relative rounded-lg shadow-lg border-2 border-gray-200 overflow-hidden bg-gray-50 z-0">
      <MapContainer
        center={center}
        zoom={15}
        style={{ height: "640px", width: "100%" }}
        zoomControl={false}
      >
        <TileLayer
          key={mapType}
          url={getTileLayerUrl()}
          attribution={getAttribution()}
        />
        {onCheckpointAdd && <MapEvents onCheckpointAdd={onCheckpointAdd} isClickValid={isClickValid} />}
        <MapControls 
          onMapTypeChange={setMapType} 
          currentMapType={mapType} 
          setIsClickValid={setIsClickValid}
        />

        {Object.entries(cameras).map(([cameraNumber, location]) => {
          if (location && Array.isArray(location) && location.length === 2) {
            return (
              <Marker
                key={cameraNumber}
                position={location}
                icon={createCameraIcon(cameraNumber)}
                zIndexOffset={100}
              >
                <Popup>
                  <div className="flex items-center">
                    <FaVideo className="text-blue-500 mr-2" />
                    <span>Camera {cameraNumber}</span>
                  </div>
                </Popup>
              </Marker>
            );
          }
          return null;
        })}

        {showCarMarkers && sortedCarHistory.length > 0 && sortedCarHistory[0].location && Array.isArray(sortedCarHistory[0].location) && sortedCarHistory[0].location.length === 2 && (
          <Marker
            position={sortedCarHistory[0].location}
            icon={createCarIcon()}
            zIndexOffset={200}
          >
            <Popup>
              <div className="flex items-center">
                <FaCar className="text-red-500 mr-2" />
                <span>
                  {sortedCarHistory[0].plate} - {sortedCarHistory[0].cameraName} <br />
                  {new Date(sortedCarHistory[0].timestamp).toLocaleString("th-TH")}
                </span>
              </div>
            </Popup>
          </Marker>
        )}

        {showRoute && sortedCarHistory.length > 1 && (
          <Polyline
            positions={sortedCarHistory.filter(p => p.location && Array.isArray(p.location) && p.location.length === 2).map((p) => p.location)}
            color="red"
            weight={4}
            opacity={0.8}
          />
        )}

        {checkpoints.map((position, index) => (
          <Marker
            key={`checkpoint-${position[0]}-${position[1]}`}
            position={position}
            icon={createCheckpointIcon()}
            eventHandlers={
              onCheckpointRemove
                ? {
                    click: () => onCheckpointRemove(position),
                  }
                : undefined
            }
            zIndexOffset={300}
          >
            <Popup>
              <div className="flex items-center">
                <span>Checkpoint at ({position[0].toFixed(4)}, {position[1].toFixed(4)})</span>
              </div>
            </Popup>
          </Marker>
        ))}

        <UpdateMapCenter center={center} />
      </MapContainer>
    </div>
  );
}