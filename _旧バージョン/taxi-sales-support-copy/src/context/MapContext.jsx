// MapContext.jsx - 地図・GPS状態管理
const { createContext, useState, useCallback, useContext } = React;

window.MapContext = createContext(null);

window.MapProvider = ({ children }) => {
  const [currentPosition, setCurrentPosition] = useState(null);
  const [mapCenter, setMapCenter] = useState(APP_CONSTANTS.DEFAULT_MAP_CENTER);
  const [zoom, setZoom] = useState(APP_CONSTANTS.DEFAULT_MAP_ZOOM);
  const [isTracking, setIsTracking] = useState(false);
  const [gpsError, setGpsError] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [heading, setHeading] = useState(null);

  const updatePosition = useCallback((position) => {
    const pos = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
    setCurrentPosition(pos);
    setAccuracy(position.coords.accuracy);
    setSpeed(position.coords.speed);
    setHeading(position.coords.heading);
    setGpsError(null);
  }, []);

  const value = {
    currentPosition,
    setCurrentPosition,
    mapCenter,
    setMapCenter,
    zoom,
    setZoom,
    isTracking,
    setIsTracking,
    gpsError,
    setGpsError,
    accuracy,
    speed,
    heading,
    updatePosition,
  };

  return React.createElement(MapContext.Provider, { value }, children);
};

window.useMapContext = () => useContext(MapContext);
