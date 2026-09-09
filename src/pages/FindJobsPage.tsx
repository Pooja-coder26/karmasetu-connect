
declare const google: any;
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  MapPin,
  Search,
  Navigation,
  Loader2,
  RotateCcw,
  IndianRupee,
  Flag,
  Ban,
  Maximize2,
  Minimize2,
} from 'lucide-react';

import {
  setOptions,
  importLibrary,
} from '@googlemaps/js-api-loader';

import { useAuth } from '../context/AuthContext';
import { socket } from '../lib/socket';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';
import ReportModal from '../components/ReportModal';
import BlockModal from '../components/BlockModal';
import { useMapFullscreen } from '../lib/useMapFullscreen';
import {
  searchIndiaLocations,
  searchLocalIndiaPlaces,
  PlaceSuggestion,
} from '../lib/locationSearch';

async function resolveLocationFallback(
  locationStr: string
): Promise<{ lat: number; lng: number } | null> {
  const raw = String(locationStr || '').trim();
  if (!raw) return null;

  const queries = [
    { q: raw, countrycodes: 'in' },
    { q: raw.toLowerCase().includes('india') ? raw : `${raw}, India` },
  ];

  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 2) {
      queries.push({
        q: `${parts[0]}, ${parts[parts.length - 1]}`,
        countrycodes: 'in',
      });
    }
    if (parts.length >= 2) {
      queries.push({ q: parts[0], countrycodes: 'in' });
    }
  }

  queries.push({ q: raw });

  for (const item of queries) {
    try {
      let url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        item.q
      )}`;
      if (item.countrycodes) {
        url += `&countrycodes=${item.countrycodes}`;
      }
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
          }
        }
      }
    } catch (err) {
      // Continue to next query
    }
  }

  return null;
}

export type TravelModeType = 'DRIVING' | 'BICYCLING';

export interface RoadRouteInfo {
  distanceKm: number;
  distanceText: string;
  durationText: string;
  carDurationText?: string;
  bikeDurationText?: string;
  points: { lat: number; lng: number }[];
  travelMode: TravelModeType;
  unavailable?: boolean;
  unavailableMessage?: string;
  isFallback?: boolean;
  fallbackMessage?: string;
}

export const calculateStraightLineDistance = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number | null => {
  if (
    !Number.isFinite(lat1) ||
    !Number.isFinite(lng1) ||
    !Number.isFinite(lat2) ||
    !Number.isFinite(lng2) ||
    (lat2 === 0 && lng2 === 0)
  ) {
    return null;
  }
  const earthRadius = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = earthRadius * c;
  return Math.round(dist * 10) / 10;
};

interface Job {
  id: number;
  title: string;
  description: string;
  wage: number;
  location: string;
  employer_id: number;
  employer_name?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  distanceKm?: number;
  roadRoute?: RoadRouteInfo | null;
  isCalculatingRoute?: boolean;
  routeFailed?: boolean;
  work_type?: string | null;
}

interface UserLocation {
  lat: number;
  lng: number;
}

const WORK_TYPES = [
  { value: 'ALL', label: 'All Work Types' },
  { value: 'CONSTRUCTION', label: 'Construction' },
  { value: 'PLUMBING', label: 'Plumbing' },
  { value: 'ELECTRICAL', label: 'Electrical' },
  { value: 'PAINTING', label: 'Painting' },
  { value: 'CLEANING', label: 'Cleaning' },
  { value: 'GARDENING', label: 'Gardening' },
  { value: 'DRIVING', label: 'Driver' },
  { value: 'CARPENTRY', label: 'Carpentry' },
  { value: 'COOKING', label: 'Cooking' },
  { value: 'ANY_DAILY_WAGE', label: 'Any Daily Wage Work' },
];

const WORK_TYPE_KEYWORDS: Record<string, string[]> = {
  CONSTRUCTION: ['construct', 'construction', 'building', 'mason', 'brick', 'civil', 'site work'],
  PLUMBING: ['plumb', 'plumber', 'plumbing', 'pipe', 'leakage', 'fitting', 'tap', 'drain'],
  ELECTRICAL: ['electric', 'electrician', 'electrical', 'wiring', 'fuse', 'circuit'],
  PAINTING: ['paint', 'painter', 'painting', 'whitewash', 'polish'],
  CLEANING: ['clean', 'cleaner', 'cleaning', 'housekeeping', 'maid', 'sweeper', 'sanitiz'],
  GARDENING: ['garden', 'gardener', 'gardening', 'lawn', 'plants', 'landscap', 'horticult', 'grass'],
  DRIVING: ['driver', 'driving', 'taxi', 'rider', 'chauffeur', 'cab', 'auto'],
  CARPENTRY: ['carpent', 'carpenter', 'carpentry', 'wood', 'furniture'],
  COOKING: ['cook', 'cooking', 'chef', 'kitchen', 'catering'],
  ANY_DAILY_WAGE: ['daily wage', 'any daily wage', 'wage', 'helper', 'labour', 'labor', 'general'],
};

const DISTANCE_OPTIONS = [
  { value: 'ALL', label: 'Any Distance' },
  { value: '2', label: 'Within 2 km' },
  { value: '5', label: 'Within 5 km' },
  { value: '10', label: 'Within 10 km' },
  { value: '25', label: 'Within 25 km' },
];

export default function FindJobsPage() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [filteredJobs, setFilteredJobs] = useState<Job[]>([]);
  const [highlightedJobId, setHighlightedJobId] = useState<number | null>(null);

  const [searchTitle, setSearchTitle] = useState('');
  const [selectedWorkType, setSelectedWorkType] = useState('ALL');
  const [minWage, setMinWage] = useState('');
  const [maxWage, setMaxWage] = useState('');
  const [selectedDistance, setSelectedDistance] = useState('ALL');
  const [searchLocation, setSearchLocation] = useState('');
  const [selectedLocationPlace, setSelectedLocationPlace] = useState<PlaceSuggestion | null>(null);
  const [locationSuggestions, setLocationSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  const [reportTarget, setReportTarget] = useState<{ id: number; name?: string } | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ id: number; name?: string } | null>(null);

  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');

  const [mapReady, setMapReady] = useState(false);
  const [nearbyOnly, setNearbyOnly] = useState(false);

  const searchTimeoutRef = useRef<any>(null);

  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const userMarkerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const activeJobMarkerIdRef = useRef<number | null>(null);
  const suggestionsContainerRef = useRef<HTMLDivElement | null>(null);
  const directionsServiceRef = useRef<any>(null);
  const directionsRendererRef = useRef<any>(null);
  const routePolylineRef = useRef<any>(null);
  const activeRoutePolylinesRef = useRef<any[]>([]);
  const activeRouteMarkersRef = useRef<any[]>([]);
  const activeDirectionsJobIdRef = useRef<number | null>(null);
  const roadRouteCacheRef = useRef<Map<string, RoadRouteInfo>>(new Map());

  const [activeRouteInfo, setActiveRouteInfo] = useState<{
    jobId: number;
    jobTitle: string;
    distance?: string;
    duration?: string;
    travelMode: TravelModeType;
    carDurationText?: string;
    bikeDurationText?: string;
    sharedRoute?: RoadRouteInfo | null;
    isFallback?: boolean;
    fallbackMessage?: string;
    carRoute?: RoadRouteInfo | null;
    bikeRoute?: RoadRouteInfo | null;
    origin?: { lat: number; lng: number };
    destination?: { lat: number; lng: number };
  } | null>(null);
  const activeRouteInfoRef = useRef(activeRouteInfo);
  useEffect(() => {
    activeRouteInfoRef.current = activeRouteInfo;
  }, [activeRouteInfo]);
  const [directionsLoading, setDirectionsLoading] = useState(false);
  const [selectedTravelMode, setSelectedTravelMode] = useState<TravelModeType>('DRIVING');

  const [activeMapType, setActiveMapType] = useState<'roadmap' | 'satellite'>('roadmap');

  /* =========================================
     MAP FULLSCREEN WITH POPSTATE / BACK BUTTON
  ========================================= */
  const {
    isFullscreen: isMapFullscreen,
    toggleFullscreen: toggleMapFullscreen,
  } = useMapFullscreen({
    mapInstanceRef: mapInstance,
    containerRef: mapContainerRef,
  });

  // Close location autocomplete dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsContainerRef.current &&
        !suggestionsContainerRef.current.contains(e.target as Node)
      ) {
        setShowLocationSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  /* =========================================
     LOAD GOOGLE MAPS
  ========================================= */

  useEffect(() => {
    initializeGoogleMaps();
  }, []);

  /* =========================================
     HANDLE NOTIFICATION DEEP LINK NAVIGATION
  ========================================= */
  useEffect(() => {
    const navState = location.state as { jobId?: number | string } | null;
    const targetJobId = navState?.jobId ? Number(navState.jobId) : null;
    if (!targetJobId || jobs.length === 0) return;

    // If target job is in all jobs but filtered out, reset filters so it is visible
    const isInFiltered = filteredJobs.some((j) => j.id === targetJobId);
    if (!isInFiltered && jobs.some((j) => j.id === targetJobId)) {
      setSearchTitle('');
      setSelectedWorkType('ALL');
      setMinWage('');
      setMaxWage('');
      setSelectedDistance('ALL');
      setSearchLocation('');
      setSelectedLocationPlace(null);
      setShowLocationSuggestions(false);
      setNearbyOnly(false);
      setFilteredJobs(jobs);
    }

    setHighlightedJobId(targetJobId);

    const timer = setTimeout(() => {
      const cardEl = document.getElementById(`job-card-${targetJobId}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      const targetJob = jobs.find((j) => j.id === targetJobId);
      if (targetJob && targetJob.latitude && targetJob.longitude && mapInstance.current) {
        mapInstance.current.panTo({
          lat: Number(targetJob.latitude),
          lng: Number(targetJob.longitude),
        });
        mapInstance.current.setZoom(16);
      }
    }, 350);

    const clearHighlightTimer = setTimeout(() => {
      setHighlightedJobId((prev) => (prev === targetJobId ? null : prev));
    }, 4500);

    try {
      window.history.replaceState({}, document.title);
    } catch {
      // Ignore
    }

    return () => {
      clearTimeout(timer);
      clearTimeout(clearHighlightTimer);
    };
  }, [location.state, jobs]);

  const searchTitleRef = useRef(searchTitle);
  const searchLocationRef = useRef(searchLocation);
  const selectedLocationPlaceRef = useRef(selectedLocationPlace);
  const selectedWorkTypeRef = useRef(selectedWorkType);
  const minWageRef = useRef(minWage);
  const maxWageRef = useRef(maxWage);
  const selectedDistanceRef = useRef(selectedDistance);
  const nearbyOnlyRef = useRef(nearbyOnly);
  const userLocationRef = useRef(userLocation);

  useEffect(() => { searchTitleRef.current = searchTitle; }, [searchTitle]);
  useEffect(() => { searchLocationRef.current = searchLocation; }, [searchLocation]);
  useEffect(() => { selectedLocationPlaceRef.current = selectedLocationPlace; }, [selectedLocationPlace]);
  useEffect(() => { selectedWorkTypeRef.current = selectedWorkType; }, [selectedWorkType]);
  useEffect(() => { minWageRef.current = minWage; }, [minWage]);
  useEffect(() => { maxWageRef.current = maxWage; }, [maxWage]);
  useEffect(() => { selectedDistanceRef.current = selectedDistance; }, [selectedDistance]);
  useEffect(() => { nearbyOnlyRef.current = nearbyOnly; }, [nearbyOnly]);
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);

  /* =========================================
     FETCH JOBS & REAL-TIME CLAIM LISTENER
  ========================================= */

  useEffect(() => {
    fetchJobs();

    const handleJobAdded = (data: any) => {
      console.log('Real-time jobAdded event received:', data);
      fetchJobs();
    };

    const handleJobUnavailable = (data: any) => {
      const claimedId = Number(data?.job_id);
      if (claimedId) {
        setJobs((prev) => {
          const updated = prev.filter((j) => j.id !== claimedId);
          renderMarkers(updated, userLocation);
          return updated;
        });
        setFilteredJobs((prev) => prev.filter((j) => j.id !== claimedId));
      }
    };

    const handleJobReopened = () => {
      fetchJobs();
    };

    const handleJobStatusUpdated = (data: any) => {
      if (data?.status === 'OPEN') {
        fetchJobs();
      } else if (data?.status === 'RESERVED' || data?.status === 'HIRED' || data?.status === 'COMPLETED') {
        handleJobUnavailable(data);
      }
    };

    socket.on('jobAdded', handleJobAdded);
    socket.on('applicationAdded', handleJobUnavailable);
    socket.on('jobClaimed', handleJobUnavailable);
    socket.on('jobReopened', handleJobReopened);
    socket.on('jobStatusUpdated', handleJobStatusUpdated);

    return () => {
      socket.off('jobAdded', handleJobAdded);
      socket.off('applicationAdded', handleJobUnavailable);
      socket.off('jobClaimed', handleJobUnavailable);
      socket.off('jobReopened', handleJobReopened);
      socket.off('jobStatusUpdated', handleJobStatusUpdated);
    };
  }, [userLocation]);

  /* =========================================
     MAP LAYER CONTROLS (ROADMAP / SATELLITE)
  ========================================= */

  const switchToRoadmap = () => {
    if (!mapInstance.current) return;
    mapInstance.current.setMapTypeId('roadmap');
    setActiveMapType('roadmap');
  };

  const switchToSatellite = () => {
    if (!mapInstance.current) return;
    mapInstance.current.setMapTypeId('hybrid');
    setActiveMapType('satellite');
  };

  /* =========================================
     INITIALIZE GOOGLE MAPS
  ========================================= */

  const initializeGoogleMaps = async () => {
    try {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

      if (!apiKey) {
        setLocationMessage('Google Maps API key is missing.');
        return;
      }

      setOptions({
        key: apiKey,
        v: 'weekly',
      });

      const { Map } = (await importLibrary('maps')) as any;
      const { Geocoder } = (await importLibrary('geocoding')) as any;
      let RoutesLib: any = null;
      try {
        RoutesLib = (await importLibrary('routes')) as any;
      } catch (e) {
        console.warn('Could not load routes library:', e);
      }

      if (!mapRef.current) return;

      // Pan-India overview center (does NOT fallback to Bengaluru)
      const defaultCenter = {
        lat: 20.5937,
        lng: 78.9629,
      };

      mapInstance.current = new Map(mapRef.current, {
        center: defaultCenter,
        zoom: 5,
        mapTypeId: 'roadmap',
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: true,
        fullscreenControlOptions: {
          position:
            typeof google !== 'undefined' && google.maps?.ControlPosition
              ? google.maps.ControlPosition.RIGHT_TOP
              : 3,
        },
      });

      geocoderRef.current = new Geocoder();
      infoWindowRef.current = new google.maps.InfoWindow();

      if (RoutesLib?.DirectionsService && RoutesLib?.DirectionsRenderer) {
        directionsServiceRef.current = new RoutesLib.DirectionsService();
        directionsRendererRef.current = new RoutesLib.DirectionsRenderer({
          suppressMarkers: true,
          preserveViewport: false,
          polylineOptions: {
            strokeColor: '#2563eb',
            strokeWeight: 5,
            strokeOpacity: 0.85,
          },
        });
      }

      infoWindowRef.current.addListener('closeclick', () => {
        activeJobMarkerIdRef.current = null;
      });

      mapInstance.current.addListener('click', () => {
        infoWindowRef.current?.close();
        activeJobMarkerIdRef.current = null;
      });

      mapInstance.current.addListener('maptypeid_changed', () => {
        const currentType = mapInstance.current?.getMapTypeId();
        if (currentType === 'satellite' || currentType === 'hybrid') {
          setActiveMapType('satellite');
        } else {
          setActiveMapType('roadmap');
        }
      });

      setMapReady(true);
    } catch (error) {
      console.error('Google Maps loading error:', error);
      setLocationMessage('Unable to load Google Maps.');
    }
  };

  /* =========================================
     DIRECTIONS (INSIDE EXISTING MAP)
  ========================================= */

  // Decodes Google Maps encoded polyline algorithm into LatLng points
  const decodeGooglePolyline = (encoded: string): { lat: number; lng: number }[] => {
    const points: { lat: number; lng: number }[] = [];
    let index = 0;
    const len = encoded.length;
    let lat = 0;
    let lng = 0;

    while (index < len) {
      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }

    return points;
  };

  // Completely resets and disposes all active route state and polyline elements from the map
  const clearAllActiveRoutes = () => {
    // 1. Dispose all active route polylines
    if (activeRoutePolylinesRef.current && activeRoutePolylinesRef.current.length > 0) {
      activeRoutePolylinesRef.current.forEach((poly) => {
        try {
          poly.setMap(null);
        } catch (e) {}
      });
      activeRoutePolylinesRef.current = [];
    }

    if (routePolylineRef.current) {
      try {
        routePolylineRef.current.setMap(null);
      } catch (e) {}
      routePolylineRef.current = null;
    }

    // 2. Dispose any route markers created for directions
    if (activeRouteMarkersRef.current && activeRouteMarkersRef.current.length > 0) {
      activeRouteMarkersRef.current.forEach((marker) => {
        try {
          marker.setMap(null);
        } catch (e) {}
      });
      activeRouteMarkersRef.current = [];
    }

    // 3. Clear Google DirectionsRenderer if present
    if (directionsRendererRef.current) {
      try {
        directionsRendererRef.current.setDirections({ routes: [] });
        directionsRendererRef.current.setMap(null);
      } catch (e) {}
    }

    // 4. Reset all route state, target job IDs, and loading indicators
    setActiveRouteInfo(null);
    activeRouteInfoRef.current = null;
    activeDirectionsJobIdRef.current = null;
    setDirectionsLoading(false);
    setJobs((prev) => prev.map((j) => (j.roadRoute ? { ...j, roadRoute: undefined } : j)));
    setFilteredJobs((prev) => prev.map((j) => (j.roadRoute ? { ...j, roadRoute: undefined } : j)));
  };

  const handleClearDirections = () => {
    clearAllActiveRoutes();

    // Reset map view back to showing filtered jobs and user location
    if (mapInstance.current) {
      const bounds = renderMarkers(filteredJobs, userLocation);
      if (bounds && !bounds.isEmpty()) {
        mapInstance.current.fitBounds(bounds, 70);
      } else if (userLocation) {
        mapInstance.current.panTo(userLocation);
        mapInstance.current.setZoom(13);
      }
    }
  };

  /* =========================================
     SHORTEST ROAD ROUTING ENGINE (CAR & BIKE)
  ========================================= */

  // Fetches the shortest road route between origin and destination for the selected travel mode
  // Fetches the shortest road route between origin and destination using DRIVING mode with route alternatives enabled.
  // This single shortest route is shared identically by both Car and Bike.
  const fetchShortestRoadRoute = async (
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number }
  ): Promise<RoadRouteInfo | null> => {
    // 1. Google Maps JavaScript API DirectionsService (Primary client-side routing)
    if (typeof google !== 'undefined' && google.maps && google.maps.DirectionsService) {
      try {
        const service = directionsServiceRef.current || new google.maps.DirectionsService();

        const result: any = await new Promise((resolve) => {
          service.route(
            {
              origin: new google.maps.LatLng(origin.lat, origin.lng),
              destination: new google.maps.LatLng(destination.lat, destination.lng),
              travelMode: google.maps.TravelMode.DRIVING,
              provideRouteAlternatives: true,
            },
            (response: any, status: any) => {
              resolve({ response, status });
            }
          );
        });

        if (result?.status === 'OK' && result.response?.routes?.length > 0) {
          const routes: any[] = result.response.routes;
          // Compare ALL returned route alternatives to select the one with the SMALLEST TOTAL ROAD DISTANCE
          let shortestRoute = routes[0];
          let minDistance = Infinity;

          routes.forEach((route: any) => {
            const totalDist = (route.legs || []).reduce(
              (sum: number, leg: any) => sum + (leg.distance?.value || 0),
              0
            );
            if (totalDist < minDistance) {
              minDistance = totalDist;
              shortestRoute = route;
            }
          });

          const totalDurationSec = (shortestRoute.legs || []).reduce(
            (sum: number, leg: any) => sum + (leg.duration?.value || 0),
            0
          );
          const distKmNum = Math.round((minDistance / 1000) * 10) / 10;
          const distanceText = `${distKmNum.toFixed(1)} km`;

          const carMins = Math.round(totalDurationSec / 60);
          const carDurationText =
            carMins >= 60 ? `${Math.floor(carMins / 60)} hr ${carMins % 60} mins` : `${carMins} mins`;

          // Bike travel time based on the exact same shortest road distance (~15 km/h)
          const bikeMins = Math.max(1, Math.round((distKmNum / 15) * 60));
          const bikeDurationText =
            bikeMins >= 60 ? `${Math.floor(bikeMins / 60)} hr ${bikeMins % 60} mins` : `${bikeMins} mins`;

          const points: { lat: number; lng: number }[] = [];
          if (shortestRoute.overview_path) {
            shortestRoute.overview_path.forEach((p: any) => {
              points.push({
                lat: typeof p.lat === 'function' ? p.lat() : p.lat,
                lng: typeof p.lng === 'function' ? p.lng() : p.lng,
              });
            });
          }

          return {
            distanceKm: distKmNum,
            distanceText,
            durationText: carDurationText,
            carDurationText,
            bikeDurationText,
            points,
            travelMode: 'DRIVING',
          };
        }
      } catch (directionsErr) {
        console.warn('Google Maps DirectionsService error:', directionsErr);
      }
    }

    // 2. Google Routes API v2 (computeRoutes) with computeAlternativeRoutes: true
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      try {
        const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline',
          },
          body: JSON.stringify({
            origin: {
              location: {
                latLng: {
                  latitude: origin.lat,
                  longitude: origin.lng,
                },
              },
            },
            destination: {
              location: {
                latLng: {
                  latitude: destination.lat,
                  longitude: destination.lng,
                },
              },
            },
            travelMode: 'DRIVE',
            computeAlternativeRoutes: true,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const routes: any[] = data.routes || [];
          if (routes.length > 0) {
            // Sort routes by distanceMeters ascending to select the absolute SHORTEST road route
            routes.sort((a, b) => (Number(a.distanceMeters) || 0) - (Number(b.distanceMeters) || 0));
            const shortest = routes[0];

            if (shortest.polyline?.encodedPolyline) {
              const points = decodeGooglePolyline(shortest.polyline.encodedPolyline);
              const distMeters = Number(shortest.distanceMeters) || 0;
              const distKmNum = Math.round((distMeters / 1000) * 10) / 10;
              const distanceText = `${distKmNum.toFixed(1)} km`;

              let carDurationText = '';
              if (shortest.duration) {
                const totalSec = parseInt(String(shortest.duration).replace('s', ''), 10);
                const mins = Math.round(totalSec / 60);
                carDurationText =
                  mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} mins` : `${mins} mins`;
              }

              const bikeMins = Math.max(1, Math.round((distKmNum / 15) * 60));
              const bikeDurationText =
                bikeMins >= 60 ? `${Math.floor(bikeMins / 60)} hr ${bikeMins % 60} mins` : `${bikeMins} mins`;

              return {
                distanceKm: distKmNum,
                distanceText,
                durationText: carDurationText || `${Math.round(distKmNum * 2.5)} mins`,
                carDurationText: carDurationText || `${Math.round(distKmNum * 2.5)} mins`,
                bikeDurationText,
                points,
                travelMode: 'DRIVING',
              };
            }
          }
        }
      } catch (err) {
        console.warn('Google Routes API fetch error:', err);
      }
    }

    // 3. Project OSRM fallback for driving mode
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=true`;
      const osrmResp = await fetch(osrmUrl);
      if (osrmResp.ok) {
        const osrmData = await osrmResp.json();
        const routes: any[] = osrmData.routes || [];
        if (routes.length > 0) {
          routes.sort((a, b) => (Number(a.distance) || 0) - (Number(b.distance) || 0));
          const shortest = routes[0];

          if (shortest.geometry?.coordinates?.length) {
            const points = shortest.geometry.coordinates.map((c: [number, number]) => ({
              lat: c[1],
              lng: c[0],
            }));
            const distMeters = Number(shortest.distance) || 0;
            const distKmNum = Math.round((distMeters / 1000) * 10) / 10;
            const distanceText = `${distKmNum.toFixed(1)} km`;

            let carDurationText = '';
            if (shortest.duration) {
              const mins = Math.round(Number(shortest.duration) / 60);
              carDurationText =
                mins >= 60 ? `${Math.floor(mins / 60)} hr ${mins % 60} mins` : `${mins} mins`;
            }

            const bikeMins = Math.max(1, Math.round((distKmNum / 15) * 60));
            const bikeDurationText =
              bikeMins >= 60 ? `${Math.floor(bikeMins / 60)} hr ${bikeMins % 60} mins` : `${bikeMins} mins`;

            return {
              distanceKm: distKmNum,
              distanceText,
              durationText: carDurationText || `${Math.round(distKmNum * 2.5)} mins`,
              carDurationText: carDurationText || `${Math.round(distKmNum * 2.5)} mins`,
              bikeDurationText,
              points,
              travelMode: 'DRIVING',
            };
          }
        }
      }
    } catch (osrmErr) {
      console.warn('OSRM routing error:', osrmErr);
    }

    return null;
  };

  // Helper to update straight-line distances on job list
  const updateJobStraightDistances = (workerLoc: UserLocation, targetJobs: Job[]): Job[] => {
    if (!workerLoc || !Number.isFinite(workerLoc.lat) || !Number.isFinite(workerLoc.lng)) {
      return targetJobs;
    }
    return targetJobs.map((j) => {
      const d = calculateStraightLineDistance(
        workerLoc.lat,
        workerLoc.lng,
        Number(j.latitude),
        Number(j.longitude)
      );
      return { ...j, distanceKm: d !== null ? d : undefined };
    });
  };

  const handleGetDirections = (job: Job, modeOverride?: TravelModeType) => {
    // 1. Immediately tear down any previous route, polyline, markers, and state
    clearAllActiveRoutes();
    activeDirectionsJobIdRef.current = job.id;

    const travelMode = modeOverride || selectedTravelMode || 'DRIVING';
    setSelectedTravelMode(travelMode);

    // 2. Validate destination coordinates
    const destLat =
      job.latitude !== null && job.latitude !== undefined && job.latitude !== ''
        ? Number(job.latitude)
        : null;
    const destLng =
      job.longitude !== null && job.longitude !== undefined && job.longitude !== ''
        ? Number(job.longitude)
        : null;

    if (
      destLat === null ||
      destLng === null ||
      !Number.isFinite(destLat) ||
      !Number.isFinite(destLng) ||
      (destLat === 0 && destLng === 0)
    ) {
      alert('Directions are not available: this job does not have valid location coordinates.');
      return;
    }

    // Function to calculate and render the route inside the existing map
    const executeRouteForWorker = async (workerCoords: UserLocation) => {
      clearAllActiveRoutes();
      activeDirectionsJobIdRef.current = job.id;

      if (!mapInstance.current) {
        alert('Map is not ready yet. Please wait a moment and try again.');
        return;
      }

      // Origin is strictly worker current location; Destination is strictly this clicked job
      const origin = { lat: Number(workerCoords.lat), lng: Number(workerCoords.lng) };
      const destination = { lat: destLat, lng: destLng };

      setDirectionsLoading(true);

      const cacheKey = `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}->${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
      let shortestRoute = roadRouteCacheRef.current.get(cacheKey) || null;

      if (!shortestRoute) {
        // Calculate ONLY ONE shortest driving road route with route alternatives enabled
        const computed = await fetchShortestRoadRoute(origin, destination);

        if (activeDirectionsJobIdRef.current !== job.id) {
          return;
        }

        if (!computed || !computed.points || computed.points.length === 0) {
          setDirectionsLoading(false);
          alert('Unable to calculate directions to this job location. Please try again.');
          return;
        }

        shortestRoute = computed;
        roadRouteCacheRef.current.set(cacheKey, shortestRoute);
      }

      if (activeDirectionsJobIdRef.current !== job.id) {
        return;
      }

      const currentMode = travelMode || selectedTravelMode || 'DRIVING';
      const durationForMode =
        currentMode === 'BICYCLING'
          ? shortestRoute.bikeDurationText || shortestRoute.durationText
          : shortestRoute.carDurationText || shortestRoute.durationText;

      // Clean up previous polylines
      if (activeRoutePolylinesRef.current && activeRoutePolylinesRef.current.length > 0) {
        activeRoutePolylinesRef.current.forEach((p) => {
          try {
            p.setMap(null);
          } catch (e) {}
        });
        activeRoutePolylinesRef.current = [];
      }
      if (routePolylineRef.current) {
        try {
          routePolylineRef.current.setMap(null);
        } catch (e) {}
        routePolylineRef.current = null;
      }

      // Draw single shared shortest road route polyline on map
      if (typeof google !== 'undefined' && google.maps && mapInstance.current && shortestRoute.points?.length > 0) {
        const poly = new google.maps.Polyline({
          path: shortestRoute.points,
          map: mapInstance.current,
          strokeColor: '#2563eb',
          strokeWeight: 5,
          strokeOpacity: 0.85,
        });
        routePolylineRef.current = poly;
        activeRoutePolylinesRef.current = [poly];

        const bounds = new google.maps.LatLngBounds();
        shortestRoute.points.forEach((pt) => bounds.extend(pt));
        bounds.extend(origin);
        bounds.extend(destination);
        mapInstance.current.fitBounds(bounds, 60);
      }

      const newActiveRouteInfo = {
        jobId: job.id,
        jobTitle: job.title,
        distance: shortestRoute.distanceText,
        duration: durationForMode,
        travelMode: currentMode,
        carDurationText: shortestRoute.carDurationText || shortestRoute.durationText,
        bikeDurationText: shortestRoute.bikeDurationText || shortestRoute.durationText,
        sharedRoute: shortestRoute,
        origin,
        destination,
      };

      setActiveRouteInfo(newActiveRouteInfo);
      activeRouteInfoRef.current = newActiveRouteInfo;

      // Single Source of Truth update on job
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, roadRoute: shortestRoute } : j))
      );
      setFilteredJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, roadRoute: shortestRoute } : j))
      );

      infoWindowRef.current?.close();

      if (mapRef.current) {
        mapRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setDirectionsLoading(false);
    };

    // Reuse existing valid user location if already detected/available
    const existingLoc = userLocation || userLocationRef.current;
    if (existingLoc && Number.isFinite(existingLoc.lat) && Number.isFinite(existingLoc.lng)) {
      executeRouteForWorker(existingLoc);
      return;
    }

    // Otherwise request browser geolocation
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setDirectionsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc: UserLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setUserLocation(loc);
        userLocationRef.current = loc;

        // Ensure user location marker on map
        if (mapInstance.current && typeof google !== 'undefined' && google.maps) {
          if (!userMarkerRef.current) {
            userMarkerRef.current = new google.maps.Marker({
              position: loc,
              map: mapInstance.current,
              title: 'Your Current Location',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#2563eb',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              },
            });
          } else {
            userMarkerRef.current.setPosition(loc);
            userMarkerRef.current.setMap(mapInstance.current);
          }
        }

        const updated = updateJobStraightDistances(loc, jobs);
        setJobs(updated);
        executeRouteForWorker(loc);
      },
      (err) => {
        setDirectionsLoading(false);
        console.warn('Geolocation permission error:', err);
        if (err.code === err.PERMISSION_DENIED) {
          alert('Location permission was denied. Please allow location access to calculate directions from your current position.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          alert('Location information is currently unavailable. Please try again.');
        } else if (err.code === err.TIMEOUT) {
          alert('Location request timed out. Please try again.');
        } else {
          alert('Unable to access your location. Please allow browser location access.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const handleSwitchTravelMode = (arg1: Job | TravelModeType, arg2?: TravelModeType) => {
    const newMode: TravelModeType = typeof arg1 === 'string' ? arg1 : (arg2 || 'DRIVING');
    const targetJob: Job | undefined = typeof arg1 === 'object' ? arg1 : undefined;

    setSelectedTravelMode(newMode);

    // If there is an active route for this job:
    if (
      activeRouteInfoRef.current &&
      (!targetJob || targetJob.id === activeRouteInfoRef.current.jobId)
    ) {
      // Switching between Car and Bike must NOT change the route polyline or road distance!
      // Do NOT call Directions API again.
      const newDuration =
        newMode === 'BICYCLING'
          ? activeRouteInfoRef.current.bikeDurationText || activeRouteInfoRef.current.duration
          : activeRouteInfoRef.current.carDurationText || activeRouteInfoRef.current.duration;

      const updatedInfo = {
        ...activeRouteInfoRef.current,
        travelMode: newMode,
        duration: newDuration,
      };
      setActiveRouteInfo(updatedInfo);
      activeRouteInfoRef.current = updatedInfo;
      return;
    }

    if (targetJob) {
      handleGetDirections(targetJob, newMode);
    }
  };

  const jobsRef = useRef<Job[]>(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const handleGetDirectionsRef = useRef<(job: Job) => void>(handleGetDirections);
  useEffect(() => {
    handleGetDirectionsRef.current = handleGetDirections;
  });

  useEffect(() => {
    (window as any).__karmasetuGetDirections = (jobId: number) => {
      const targetJob = jobsRef.current.find((j) => j.id === jobId);
      if (targetJob) {
        handleGetDirectionsRef.current(targetJob);
      }
    };
    return () => {
      delete (window as any).__karmasetuGetDirections;
    };
  }, []);

  /* =========================================
     RENDER MARKERS ON MAP
  ========================================= */

  const renderMarkers = (jobList: Job[], userLoc: UserLocation | null) => {
    if (!mapInstance.current) return null;

    // Clear old job markers
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = [];
    activeJobMarkerIdRef.current = null;

    const bounds = new google.maps.LatLngBounds();

    // User location marker (blue circle)
    if (userLoc) {
      if (!userMarkerRef.current) {
        userMarkerRef.current = new google.maps.Marker({
          position: userLoc,
          map: mapInstance.current,
          title: 'Your Current Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#2563eb',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        });
      } else {
        userMarkerRef.current.setPosition(userLoc);
        userMarkerRef.current.setMap(mapInstance.current);
      }
      bounds.extend(userLoc);
    } else if (userMarkerRef.current) {
      userMarkerRef.current.setMap(null);
    }

    // Render red job markers
    for (const job of jobList) {
      const lat =
        job.latitude !== null && job.latitude !== undefined
          ? Number(job.latitude)
          : null;
      const lng =
        job.longitude !== null && job.longitude !== undefined
          ? Number(job.longitude)
          : null;

      if (
        lat === null ||
        lng === null ||
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        (lat === 0 && lng === 0)
      ) {
        continue;
      }

      const jobMarker = new google.maps.Marker({
        position: { lat, lng },
        map: mapInstance.current,
        title: `Job Available: ${job.title} - ${job.location}`,
        icon: {
          url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
            <svg xmlns="http://www.w3.org/2000/svg" width="38" height="48" viewBox="0 0 38 48">
              <defs>
                <filter id="pinShadow" x="-20%" y="-10%" width="140%" height="130%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/>
                </filter>
                <linearGradient id="pinGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stop-color="#ef4444" />
                  <stop offset="100%" stop-color="#b91c1c" />
                </linearGradient>
              </defs>
              <!-- Professional Red Map Pin Body -->
              <path d="M19 2 C10 2 3 9.2 3 18 C3 29.5 19 46 19 46 C19 46 35 29.5 35 18 C35 9.2 28 2 19 2 Z" 
                    fill="url(#pinGrad)" 
                    stroke="#ffffff" 
                    stroke-width="2" 
                    filter="url(#pinShadow)"/>
              <!-- Inner White Circular Badge -->
              <circle cx="19" cy="18" r="9.5" fill="#ffffff" />
              <!-- Job/Work Briefcase Symbol Inside -->
              <rect x="12.5" y="14" width="13" height="8.5" rx="1.5" fill="#dc2626"/>
              <path d="M15.5 14 V12 C15.5 11.2 16.2 10.5 17 10.5 H21 C21.8 10.5 22.5 11.2 22.5 12 V14" stroke="#dc2626" stroke-width="1.4" fill="none" stroke-linecap="round"/>
              <line x1="12.5" y1="17.2" x2="25.5" y2="17.2" stroke="#ffffff" stroke-width="0.9"/>
              <rect x="17.5" y="16.2" width="3" height="2" rx="0.5" fill="#ffffff"/>
            </svg>
          `.trim())}`,
          scaledSize: new google.maps.Size(38, 48),
          anchor: new google.maps.Point(19, 48),
        },
      });

      jobMarker.addListener('click', () => {
        if (!infoWindowRef.current || !mapInstance.current) return;

        // SAME JOB MARKER CLICKED AGAIN (CONTINUOUS TOGGLE: ROADMAP <-> SATELLITE)
        if (activeJobMarkerIdRef.current === job.id) {
          const currentMapType = mapInstance.current?.getMapTypeId();
          const isCurrentlySatellite =
            currentMapType === 'satellite' || currentMapType === 'hybrid';
          const nextMapType = isCurrentlySatellite ? 'roadmap' : 'hybrid';

          mapInstance.current.setMapTypeId(nextMapType);
          setActiveMapType(nextMapType === 'hybrid' ? 'satellite' : 'roadmap');
          mapInstance.current.panTo({ lat, lng });

          // Keep selected job marker and job information visible
          if (infoWindowRef.current && !infoWindowRef.current.getMap()) {
            infoWindowRef.current.open({
              map: mapInstance.current,
              anchor: jobMarker,
            });
          }
          return;
        }

        // FIRST CLICK ON THIS RED JOB PIN (or clicking a DIFFERENT pin):
        // Reset previous pin state, remain in normal roadmap view, zoom in & center, show job details
        activeJobMarkerIdRef.current = job.id;
        mapInstance.current.setMapTypeId('roadmap');
        setActiveMapType('roadmap');
        mapInstance.current.panTo({ lat, lng });
        mapInstance.current.setZoom(16);

        const isCurrentActiveRoute = activeRouteInfoRef.current?.jobId === job.id;
        const straightDist = userLocationRef.current
          ? calculateStraightLineDistance(
              userLocationRef.current.lat,
              userLocationRef.current.lng,
              Number(job.latitude),
              Number(job.longitude)
            )
          : null;

        const distanceBadgeHtml =
          straightDist !== null
            ? `<p style="margin: 3px 0; color: #1e40af; font-size: 12px; font-weight: 600;">📍 Straight-line distance: <strong>${straightDist.toFixed(1)} km</strong></p>`
            : `<p style="margin: 3px 0; color: #64748b; font-size: 12px;">📍 Distance unavailable</p>`;

        const roadRouteDetailsHtml =
          isCurrentActiveRoute && activeRouteInfoRef.current
            ? `
                <div style="margin: 8px 0; padding: 8px 10px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px;">
                  <div style="font-size: 11px; font-weight: 700; color: #1d4ed8; letter-spacing: 0.3px; margin-bottom: 3px;">
                    ${
                      activeRouteInfoRef.current.travelMode === 'BICYCLING'
                        ? '🚲 CALCULATED BICYCLING ROUTE'
                        : '🚗 CALCULATED DRIVING ROUTE'
                    }
                  </div>
                  ${
                    activeRouteInfoRef.current.distance
                      ? `<p style="margin: 2px 0; color: #1e40af; font-size: 12.5px; font-weight: 700;">📍 Road Distance: ${activeRouteInfoRef.current.distance}</p>`
                      : ''
                  }
                  ${
                    activeRouteInfoRef.current.duration
                      ? `<p style="margin: 2px 0; color: #047857; font-size: 12.5px; font-weight: 700;">🕒 Estimated Travel Time: ${activeRouteInfoRef.current.duration}</p>`
                      : ''
                  }
                </div>
              `
            : '';

        infoWindowRef.current.setContent(`
          <div style="color: #111827; padding: 12px; min-width: 240px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <div style="display: inline-block; background-color: #fee2e2; color: #dc2626; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 9999px; margin-bottom: 6px;">
              📍 Job Location
            </div>
            <h3 style="margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #0f172a; line-height: 1.3;">${job.title}</h3>
            <p style="margin: 3px 0; font-size: 13px; color: #475569;">📍 ${job.location}</p>
            <p style="margin: 3px 0; font-weight: 700; color: #059669; font-size: 14px;">₹${job.wage}/day</p>
            ${distanceBadgeHtml}
            ${roadRouteDetailsHtml}
            
            <button
              id="info-directions-btn-${job.id}"
              style="margin-top: 10px; width: 100%; padding: 8px 12px; background: ${
                isCurrentActiveRoute ? '#dc2626' : '#2563eb'
              }; color: #ffffff; border: none; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 2px 4px rgba(37,99,235,0.25);"
            >
              ${isCurrentActiveRoute ? '✕ Clear Directions' : '🧭 Get Directions'}
            </button>
            
            <div style="margin-top: 8px; padding: 5px 8px; background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 10.5px; color: #64748b; font-weight: 500; text-align: center;">
              💡 Click marker again to toggle Satellite / Roadmap view
            </div>
          </div>
        `);

        infoWindowRef.current.open({
          map: mapInstance.current,
          anchor: jobMarker,
        });

        if (typeof google !== 'undefined' && google.maps) {
          google.maps.event.addListener(infoWindowRef.current, 'domready', () => {
            const btn = document.getElementById(`info-directions-btn-${job.id}`);
            if (btn) {
              btn.onclick = (e) => {
                e.preventDefault();
                if (activeRouteInfoRef.current?.jobId === job.id) {
                  handleClearDirections();
                } else {
                  handleGetDirections(job);
                }
              };
            }
          });
        }
      });

      markersRef.current.push(jobMarker);
      bounds.extend({ lat, lng });
    }

    return bounds;
  };

  /* =========================================
     APPLY FILTERS AND UPDATE MAP / JOBS
  ========================================= */

  const applyFiltersAndRender = (
    titleText: string = searchTitle,
    locText: string = searchLocation,
    locPlace: PlaceSuggestion | null = selectedLocationPlace,
    workTypeVal: string = selectedWorkType,
    minWageVal: string = minWage,
    maxWageVal: string = maxWage,
    distVal: string = selectedDistance,
    isNearby: boolean = nearbyOnly,
    workerLoc: UserLocation | null = userLocation,
    currentJobs: Job[] = jobs
  ) => {
    const tQuery = titleText.trim().toLowerCase();
    const lQuery = locText.trim().toLowerCase();

    // Preserve actual drivable road distances and routes; do NOT overwrite with straight-line distance
    const jobList = currentJobs;

    const filtered = jobList.filter((job) => {
      // 1. Search Query: case-insensitive match on title, description, skills, location
      let searchMatch = true;
      if (tQuery) {
        const jobFullText = `${job.title} ${job.description || ''} ${job.location || ''}`.toLowerCase();
        searchMatch = jobFullText.includes(tQuery);
      }

      // 2. Work Type / Skill filter: match explicit work_type or sensible trade keywords
      let workTypeMatch = true;
      if (workTypeVal !== 'ALL') {
        let rawWorkType = String(job.work_type || '').trim().toLowerCase();
        if (!rawWorkType && job.description) {
          const m = String(job.description).match(/Work Type:\s*([^\n\r]+)/i);
          if (m) rawWorkType = m[1].trim().toLowerCase();
        }

        if (workTypeVal === 'ANY_DAILY_WAGE') {
          workTypeMatch = true;
        } else if (rawWorkType) {
          const targetKey = workTypeVal.toLowerCase();
          const isDriver = targetKey === 'driving' && (rawWorkType.includes('driver') || rawWorkType.includes('driving'));
          const isDirectMatch = rawWorkType === targetKey || rawWorkType.includes(targetKey) || targetKey.includes(rawWorkType);
          workTypeMatch = isDriver || isDirectMatch;
        } else if (WORK_TYPE_KEYWORDS[workTypeVal]) {
          const jobText = `${job.title} ${job.description || ''}`.toLowerCase();
          workTypeMatch = WORK_TYPE_KEYWORDS[workTypeVal].some((kw) => jobText.includes(kw));
        }
      }

      // 3. Wage range filter (min & max bounds)
      let wageMatch = true;
      const min = minWageVal.trim() !== '' ? Number(minWageVal) : null;
      const max = maxWageVal.trim() !== '' ? Number(maxWageVal) : null;
      if (min !== null && !isNaN(min)) {
        wageMatch = wageMatch && job.wage >= min;
      }
      if (max !== null && !isNaN(max)) {
        wageMatch = wageMatch && job.wage <= max;
      }

      // 4. Location search & autocomplete
      let locationMatch = true;
      if (locPlace) {
        const jobLocStr = (job.location || '').toLowerCase();
        const placeName = locPlace.name.toLowerCase();
        const placeDesc = locPlace.description.toLowerCase();
        const stringMatches =
          jobLocStr.includes(placeName) || placeDesc.includes(jobLocStr);

        let coordMatches = false;
        if (job.latitude != null && job.longitude != null) {
          const d = calculateGeoRadius(
            locPlace.lat,
            locPlace.lng,
            Number(job.latitude),
            Number(job.longitude)
          );
          if (d <= 35) coordMatches = true;
        }
        locationMatch = stringMatches || coordMatches;
      } else if (lQuery) {
        locationMatch = (job.location || '').toLowerCase().includes(lQuery);
      }

      // 5. Distance Radius filter (Within 2, 5, 10, 25 km)
      let distanceMatch = true;
      if (distVal !== 'ALL') {
        const maxD = Number(distVal);
        if (!isNaN(maxD) && workerLoc) {
          distanceMatch = job.distanceKm !== undefined && job.distanceKm <= maxD;
        }
      }

      // 6. Nearby filter (within 50 km of worker)
      let nearbyMatch = true;
      if (isNearby && workerLoc) {
        nearbyMatch = job.distanceKm !== undefined && job.distanceKm <= 50;
      }

      return (
        searchMatch &&
        workTypeMatch &&
        wageMatch &&
        locationMatch &&
        distanceMatch &&
        nearbyMatch
      );
    });

    // If nearby or specific distance radius active, sort by nearest distance
    if ((isNearby || distVal !== 'ALL') && workerLoc) {
      filtered.sort((a, b) => {
        if (a.distanceKm === undefined) return 1;
        if (b.distanceKm === undefined) return -1;
        return a.distanceKm - b.distanceKm;
      });
    }

    setFilteredJobs(filtered);

    // Re-render map markers for ONLY the matching jobs
    const bounds = renderMarkers(filtered, workerLoc);

    // Pan and zoom map appropriately
    if (mapInstance.current) {
      if ((isNearby || distVal !== 'ALL') && workerLoc) {
        mapInstance.current.panTo(workerLoc);
        if (distVal === '2') mapInstance.current.setZoom(15);
        else if (distVal === '5') mapInstance.current.setZoom(14);
        else if (distVal === '10') mapInstance.current.setZoom(13);
        else if (distVal === '25') mapInstance.current.setZoom(11);
        else mapInstance.current.setZoom(13);
      } else if (locPlace) {
        mapInstance.current.panTo({ lat: locPlace.lat, lng: locPlace.lng });
        const targetZoom =
          locPlace.type === 'state' ? 7 : locPlace.type === 'district' ? 11 : 14;
        mapInstance.current.setZoom(targetZoom);
      } else if (bounds && !bounds.isEmpty()) {
        if (filtered.length === 1 && filtered[0].latitude != null && filtered[0].longitude != null) {
          mapInstance.current.panTo({
            lat: Number(filtered[0].latitude),
            lng: Number(filtered[0].longitude),
          });
          mapInstance.current.setZoom(14);
        } else {
          mapInstance.current.fitBounds(bounds, 70);
        }
      }
    }
  };

  /* =========================================
     SEARCH HANDLER
  ========================================= */

  const handleSearch = () => {
    setShowLocationSuggestions(false);
    applyFiltersAndRender(
      searchTitle,
      searchLocation,
      selectedLocationPlace,
      selectedWorkType,
      minWage,
      maxWage,
      selectedDistance,
      nearbyOnly,
      userLocation
    );
  };

  /* =========================================
     CLEAR FILTERS HANDLER
  ========================================= */

  const handleClearFilters = () => {
    setSearchTitle('');
    setSelectedWorkType('ALL');
    setMinWage('');
    setMaxWage('');
    setSelectedDistance('ALL');
    setSearchLocation('');
    setSelectedLocationPlace(null);
    setShowLocationSuggestions(false);
    setNearbyOnly(false);

    setFilteredJobs(jobs);
    const bounds = renderMarkers(jobs, userLocation);
    if (mapInstance.current && bounds && !bounds.isEmpty()) {
      mapInstance.current.fitBounds(bounds, 70);
    }
  };

  /* =========================================
     LOCATION AUTOCOMPLETE HANDLERS
  ========================================= */

  const handleLocationInputChange = (val: string) => {
    setSearchLocation(val);

    if (selectedLocationPlace && val !== selectedLocationPlace.description) {
      setSelectedLocationPlace(null);
    }

    if (val.trim().length >= 1) {
      // Instant local administrative dataset results (<1ms)
      const instant = searchLocalIndiaPlaces(val);
      setLocationSuggestions(instant);
      setShowLocationSuggestions(true);

      // Debounced live dynamic lookup for all India places, towns & villages
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(async () => {
        const fullResults = await searchIndiaLocations(val);
        setLocationSuggestions(fullResults);
      }, 250);
    } else {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
    }
  };

  const handleSelectLocationSuggestion = (item: PlaceSuggestion) => {
    setSearchLocation(item.description);
    setSelectedLocationPlace(item);
    setShowLocationSuggestions(false);
    applyFiltersAndRender(
      searchTitle,
      item.description,
      item,
      selectedWorkType,
      minWage,
      maxWage,
      selectedDistance,
      nearbyOnly,
      userLocation
    );
  };

  /* =========================================
     GET CURRENT WORKER LOCATION
  ========================================= */

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationMessage('Location is not supported by this browser.');
      alert('Location is not supported by this browser.');
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc: UserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(loc);
        setLocationLoading(false);
        setLocationMessage('Your current location is detected.');

        if (mapInstance.current) {
          mapInstance.current.panTo(loc);
          mapInstance.current.setZoom(13);
        }

        const updated = updateJobStraightDistances(loc, jobs);
        setJobs(updated);

        applyFiltersAndRender(
          searchTitle,
          searchLocation,
          selectedLocationPlace,
          selectedWorkType,
          minWage,
          maxWage,
          selectedDistance,
          nearbyOnly,
          loc,
          updated
        );
      },
      (error) => {
        console.warn('Location permission error:', error);
        setLocationLoading(false);
        setLocationMessage('Location permission was not granted.');
        alert('Could not access your location. Please allow browser location access.');
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  /* =========================================
     NEARBY JOBS BUTTON HANDLER
  ========================================= */

  const handleNearbyJobsClick = () => {
    // If nearby filter is already ON, toggle it OFF
    if (nearbyOnly) {
      setNearbyOnly(false);
      applyFiltersAndRender(
        searchTitle,
        searchLocation,
        selectedLocationPlace,
        selectedWorkType,
        minWage,
        maxWage,
        selectedDistance,
        false,
        userLocation
      );
      return;
    }

    // If nearby filter is OFF and we already have worker's location:
    if (userLocation) {
      setNearbyOnly(true);
      applyFiltersAndRender(
        searchTitle,
        searchLocation,
        selectedLocationPlace,
        selectedWorkType,
        minWage,
        maxWage,
        selectedDistance,
        true,
        userLocation
      );
      return;
    }

    // Request actual current browser location
    if (!navigator.geolocation) {
      alert('Location is not supported by this browser.');
      return;
    }

    setLocationLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc: UserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        setUserLocation(loc);
        setLocationLoading(false);
        setNearbyOnly(true);
        setLocationMessage('Current location detected.');

        const updated = updateJobStraightDistances(loc, jobs);
        setJobs(updated);

        applyFiltersAndRender(
          searchTitle,
          searchLocation,
          selectedLocationPlace,
          selectedWorkType,
          minWage,
          maxWage,
          selectedDistance,
          true,
          loc,
          updated
        );
      },
      (error) => {
        console.warn('Geolocation error:', error);
        setLocationLoading(false);
        setNearbyOnly(false);
        alert(
          'Could not access your location. Please allow browser location access in order to view nearby jobs.'
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };



  /* =========================================
     FETCH JOBS
  ========================================= */

  const fetchJobs = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/jobs`, {
        headers: getAuthHeaders(),
      });
      const data = await response.json();

      const parsedJobs: Job[] = (data || []).map((job: any) => {
        const lat =
          job.latitude !== null && job.latitude !== undefined && job.latitude !== ''
            ? Number(job.latitude)
            : null;

        const lng =
          job.longitude !== null && job.longitude !== undefined && job.longitude !== ''
            ? Number(job.longitude)
            : null;

        return {
          ...job,
          latitude: lat,
          longitude: lng,
        };
      });

      // Fill in fallback coords if any job has missing coordinates
      for (const j of parsedJobs) {
        if (
          j.latitude === null ||
          j.longitude === null ||
          !Number.isFinite(j.latitude) ||
          !Number.isFinite(j.longitude) ||
          (j.latitude === 0 && j.longitude === 0)
        ) {
          const fallback = await resolveLocationFallback(j.location);
          if (fallback) {
            j.latitude = fallback.lat;
            j.longitude = fallback.lng;
          }
        }
      }

      const withDist = userLocationRef.current
        ? updateJobStraightDistances(userLocationRef.current, parsedJobs)
        : parsedJobs;

      setJobs(withDist);
      applyFiltersAndRender(
        searchTitleRef.current,
        searchLocationRef.current,
        selectedLocationPlaceRef.current,
        selectedWorkTypeRef.current,
        minWageRef.current,
        maxWageRef.current,
        selectedDistanceRef.current,
        nearbyOnlyRef.current,
        userLocationRef.current,
        withDist
      );
    } catch (error) {
      console.error('Error fetching jobs:', error);
    }
  };

  useEffect(() => {
    if (userLocation && jobs.length > 0) {
      setJobs((prev) => updateJobStraightDistances(userLocation, prev));
      setFilteredJobs((prev) => updateJobStraightDistances(userLocation, prev));
    }
  }, [userLocation]);

  /* =========================================
     ADD MARKERS WHEN MAP & JOBS READY
  ========================================= */

  useEffect(() => {
    if (mapReady && mapInstance.current && jobs.length > 0) {
      renderMarkers(jobs, userLocation);
    }
  }, [mapReady, jobs]);

  /* =========================================
     LOCAL PLACE SEARCH RADIUS HELPER
  ========================================= */

  // Used solely for place suggestion radius filtering (NOT for worker-to-job road distances)
  const calculateGeoRadius = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ) => {
    const earthRadius = 6371;

    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadius * c;
  };

  /* =========================================
     APPLY FOR JOB
  ========================================= */

  const handleApply = async (
    jobId: number
  ) => {
    try {
      const response =
        await fetch(
          `${API_BASE_URL}/apply-job`,
          {
            method: 'POST',

            headers: {
              ...getAuthHeaders(),
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              worker_id:
                profile?.id,

              worker_name:
                profile?.name,

              job_id:
                jobId,
            }),
          }
        );

      const data =
        await response.text();

      alert(data);

      if (response.ok) {
        navigate('/applied-jobs');
      } else {
        fetchJobs();
      }

    } catch (error) {
      console.log(error);

      alert(
        'Application Failed'
      );
    }
  };

  /* =========================================
     UI
  ========================================= */

  const hasActiveFilters = Boolean(
    searchTitle.trim() ||
    selectedWorkType !== 'ALL' ||
    minWage.trim() ||
    maxWage.trim() ||
    selectedDistance !== 'ALL' ||
    searchLocation.trim() ||
    selectedLocationPlace ||
    nearbyOnly
  );

  return (
    <div className="space-y-6 sm:space-y-8">

      {/* PAGE TITLE */}

      <div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
          Find Jobs
        </h1>

        <p className="text-slate-400 mt-1.5 sm:mt-2 text-sm sm:text-base">
          Find suitable daily wage jobs near your location.
        </p>
      </div>

      {/* LOCATION */}

      <div className="glass-card p-4 sm:p-5">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">

          <div className="flex items-center gap-3">

            <div className="p-2.5 sm:p-3 rounded-xl bg-cyan-500/10 shrink-0">
              <Navigation className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400" />
            </div>

            <div className="min-w-0 flex-1">

              <p className="text-white font-semibold text-sm sm:text-base">
                Location-based Hiring
              </p>

              <p className="text-slate-400 text-xs sm:text-sm truncate">
                {locationMessage ||
                  'Detecting your location...'}
              </p>

            </div>

          </div>

          <button
            onClick={
              getCurrentLocation
            }

            disabled={
              locationLoading
            }

            className="w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-white font-semibold text-sm sm:text-base flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
          >

            {locationLoading ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />

                <span>Detecting...</span>
              </>
            ) : (
              <>
                <Navigation className="w-4 h-4 sm:w-5 sm:h-5" />

                <span>Use My Location</span>
              </>
            )}

          </button>

        </div>

      </div>

      {/* SEARCH & FILTERS */}

      <div className="glass-card p-4 sm:p-6 space-y-4">

        {/* ROW 1: KEYWORD SEARCH, LOCATION AUTOCOMPLETE, APPLY & CLEAR */}
        <div className="grid grid-cols-2 md:grid-cols-12 gap-2.5 sm:gap-3">

          {/* 1. KEYWORD SEARCH */}
          <div className="col-span-2 md:col-span-4 relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search title, skills, description..."
              value={searchTitle}
              onChange={(e) => setSearchTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSearch();
              }}
              className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs sm:text-sm"
            />
          </div>

          {/* 2. LOCATION AUTOCOMPLETE SEARCH */}
          <div className="col-span-2 md:col-span-4 relative" ref={suggestionsContainerRef}>
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <MapPin className="w-4 h-4" />
            </div>
            <input
              type="text"
              placeholder="Search location (e.g. Solade, Hebbal...)"
              value={searchLocation}
              onChange={(e) => handleLocationInputChange(e.target.value)}
              onFocus={() => {
                if (searchLocation.trim().length >= 1) {
                  const res = searchLocalIndiaPlaces(searchLocation);
                  setLocationSuggestions(res);
                  setShowLocationSuggestions(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setShowLocationSuggestions(false);
                  handleSearch();
                }
              }}
              autoComplete="off"
              className="w-full pl-10 pr-4 py-2.5 sm:py-3 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-xs sm:text-sm"
            />

            {/* AUTOCOMPLETE DROPDOWN */}
            {showLocationSuggestions && locationSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800">
                <div className="px-3 py-1.5 bg-slate-800/90 text-[10px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> All-India Suggestions
                  </span>
                  <span className="text-slate-400 font-normal lowercase text-[9px]">
                    Click to select
                  </span>
                </div>

                <ul className="max-h-56 overflow-y-auto">
                  {locationSuggestions.map((item, idx) => (
                    <li
                      key={`find-loc-${idx}-${item.name}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectLocationSuggestion(item);
                      }}
                      className="px-3 py-2.5 hover:bg-slate-800 cursor-pointer flex items-start gap-2.5 text-left transition-colors group"
                    >
                      <MapPin className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white group-hover:text-cyan-300 truncate">
                          {item.name}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {item.secondary}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* 3. APPLY / SEARCH BUTTON */}
          <button
            onClick={handleSearch}
            className="col-span-1 md:col-span-2 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-2.5 sm:py-3 px-3 sm:px-4 transition-all shadow-lg shadow-cyan-500/20 text-xs sm:text-sm cursor-pointer"
          >
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Apply</span>
          </button>

          {/* 4. CLEAR FILTERS BUTTON */}
          <button
            onClick={handleClearFilters}
            className="col-span-1 md:col-span-2 flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700 font-semibold py-2.5 sm:py-3 px-3 sm:px-4 transition-all text-xs sm:text-sm cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Clear</span>
          </button>

        </div>

        {/* ROW 2: WORK TYPE, MIN WAGE, MAX WAGE, DISTANCE RADIUS, NEARBY TOGGLE */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">

          {/* WORK TYPE / SKILL */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Work Type / Skill
            </label>
            <select
              value={selectedWorkType}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedWorkType(val);
                applyFiltersAndRender(
                  searchTitle,
                  searchLocation,
                  selectedLocationPlace,
                  val,
                  minWage,
                  maxWage,
                  selectedDistance,
                  nearbyOnly,
                  userLocation
                );
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-sm"
            >
              {WORK_TYPES.map((wt) => (
                <option key={wt.value} value={wt.value} className="bg-slate-900 text-white">
                  {wt.label}
                </option>
              ))}
            </select>
          </div>

          {/* MIN WAGE */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Min Wage (₹/day)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <IndianRupee className="w-3.5 h-3.5" />
              </div>
              <input
                type="number"
                min="0"
                step="50"
                placeholder="Min ₹"
                value={minWage}
                onChange={(e) => setMinWage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
              />
            </div>
          </div>

          {/* MAX WAGE */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Max Wage (₹/day)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <IndianRupee className="w-3.5 h-3.5" />
              </div>
              <input
                type="number"
                min="0"
                step="50"
                placeholder="Max ₹"
                value={maxWage}
                onChange={(e) => setMaxWage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch();
                }}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
              />
            </div>
          </div>

          {/* DISTANCE RADIUS */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Distance Radius
            </label>
            <select
              value={selectedDistance}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedDistance(val);
                if (val !== 'ALL' && !userLocation) {
                  getCurrentLocation();
                } else {
                  applyFiltersAndRender(
                    searchTitle,
                    searchLocation,
                    selectedLocationPlace,
                    selectedWorkType,
                    minWage,
                    maxWage,
                    val,
                    nearbyOnly,
                    userLocation
                  );
                }
              }}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 text-sm"
            >
              {DISTANCE_OPTIONS.map((dist) => (
                <option key={dist.value} value={dist.value} className="bg-slate-900 text-white">
                  {dist.label}
                </option>
              ))}
            </select>
          </div>

          {/* NEARBY TOGGLE */}
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Quick Nearby
            </label>
            <button
              onClick={handleNearbyJobsClick}
              disabled={locationLoading}
              className={`w-full flex items-center justify-center gap-2 rounded-xl font-semibold py-2.5 px-3 transition-all text-sm ${
                nearbyOnly
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700'
              } disabled:opacity-50`}
            >
              {locationLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Navigation className="w-4 h-4" />
              )}
              {nearbyOnly ? 'Nearby: ON' : 'Nearby (50km)'}
            </button>
          </div>

        </div>

        {/* ROW 3: RESULTS COUNT & ACTIVE FILTER INDICATOR */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span className="font-semibold text-cyan-400">
              {filteredJobs.length}
            </span>
            <span>of</span>
            <span className="font-semibold text-white">
              {jobs.length}
            </span>
            <span>available jobs</span>
            {hasActiveFilters && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-medium text-[11px]">
                Filtered
              </span>
            )}
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors underline underline-offset-4"
            >
              <RotateCcw className="w-3 h-3" />
              Reset all filters
            </button>
          )}
        </div>

      </div>

      {/* MAP */}

      <div className="glass-card p-4">

        <div className="flex items-center justify-between mb-4">

          <div>

            <h2 className="text-2xl font-bold text-white">
              Jobs Near You
            </h2>

            <p className="text-slate-400 text-sm mt-1">
              🔵 Your location &nbsp;
              📍 Available Jobs
            </p>

          </div>

          {mapReady && (
            <span className="text-green-400 text-sm">
              ● Map Connected
            </span>
          )}

        </div>

        {/* ACTIVE DIRECTIONS ROUTE BANNER */}
        {activeRouteInfo && (
          <div className="mb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/95 border border-blue-500/50 shadow-lg text-white">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <Navigation className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-blue-400">
                    <span>{activeRouteInfo.travelMode === 'BICYCLING' ? '🚲' : '🚗'}</span>
                    <span>
                      {activeRouteInfo.travelMode === 'BICYCLING'
                        ? 'CALCULATED BICYCLING ROUTE'
                        : 'CALCULATED DRIVING ROUTE'}
                    </span>
                  </div>

                  {/* Travel Mode Toggle in Banner */}
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      onClick={() => handleSwitchTravelMode('DRIVING')}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                        selectedTravelMode === 'DRIVING'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      🚗 Car
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchTravelMode('BICYCLING')}
                      className={`px-2 py-0.5 text-[10px] font-bold rounded transition cursor-pointer ${
                        selectedTravelMode === 'BICYCLING'
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      🚲 Bike
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-300 font-medium mt-0.5">
                  Destination: <strong className="text-white">{activeRouteInfo.jobTitle}</strong>
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold mt-1">
                  {activeRouteInfo.distance && (
                    <span className="text-blue-300 flex items-center gap-1.5">
                      <span>📍</span>
                      <span>Road Distance:</span>
                      <strong className="text-white font-bold">{activeRouteInfo.distance}</strong>
                    </span>
                  )}
                  {activeRouteInfo.duration && (
                    <span className="text-emerald-400 flex items-center gap-1.5">
                      <span>🕒</span>
                      <span>Estimated Travel Time:</span>
                      <strong className="text-white font-bold">{activeRouteInfo.duration}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearDirections}
              className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 self-end sm:self-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Directions</span>
            </button>
          </div>
        )}

        <div
          ref={mapContainerRef}
          className={
            isMapFullscreen
              ? 'fixed inset-0 z-50 bg-slate-950/95 p-2 sm:p-4 flex flex-col gap-2 backdrop-blur-md overflow-hidden'
              : 'relative w-full h-[260px] sm:h-[340px] md:h-[400px] lg:h-[460px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl'
          }
        >
          {/* Main Google Maps View */}
          <div
            ref={mapRef}
            className="w-full h-full"
          />

          {/* Clean Map Controls: ROADMAP / SATELLITE / FULLSCREEN (Positioned at TOP-LEFT of existing Map) */}
          <div className="absolute top-2.5 sm:top-3 left-2.5 sm:left-3 z-10 flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center bg-slate-900/95 backdrop-blur-md rounded-xl p-0.5 sm:p-1 border border-slate-700 shadow-2xl">
              <button
                type="button"
                onClick={switchToRoadmap}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeMapType === 'roadmap'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                ROADMAP
              </button>
              <button
                type="button"
                onClick={switchToSatellite}
                className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  activeMapType === 'satellite'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                SATELLITE
              </button>
            </div>

            {/* FULLSCREEN / EXPAND TOGGLE BUTTON */}
            <button
              type="button"
              onClick={toggleMapFullscreen}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-xl shadow-2xl backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-all border ${
                isMapFullscreen
                  ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500'
                  : 'bg-slate-900/95 hover:bg-slate-800 text-slate-200 hover:text-white border-slate-700'
              }`}
              title={isMapFullscreen ? 'Exit Fullscreen (Esc or Back)' : 'Expand Map to Fullscreen (⛶)'}
            >
              {isMapFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Exit Fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Fullscreen</span>
                </>
              )}
            </button>
          </div>

          {/* Clear Directions button on top right of map when route is active (positioned beside Fullscreen control) */}
          {activeRouteInfo && (
            <div className="absolute top-2.5 sm:top-3 right-12 sm:right-14 z-10">
              <button
                type="button"
                onClick={handleClearDirections}
                className="px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold rounded-lg bg-slate-900/95 hover:bg-slate-900 text-rose-400 hover:text-rose-300 border border-rose-500/50 shadow-xl backdrop-blur flex items-center gap-1.5 cursor-pointer transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Directions</span>
                <span className="sm:hidden">Clear</span>
              </button>
            </div>
          )}
        </div>

      </div>

      {/* JOB LIST */}

      <div className="space-y-5">

        {filteredJobs.length === 0 ? (
          <div className="glass-card p-10 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-white">No Jobs Found</h3>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              No open jobs match your current search and filter criteria. Try adjusting your filters or clearing them to see all available jobs.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-2 px-5 py-2.5 mt-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 text-sm font-semibold transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Clear All Filters
              </button>
            )}
          </div>
        ) : (

          filteredJobs.map(
            (job) => (

              <div
                key={job.id}
                id={`job-card-${job.id}`}
                className={`glass-card p-4 sm:p-6 transition-all duration-500 ${
                  highlightedJobId === job.id
                    ? 'ring-2 ring-cyan-400 bg-cyan-950/40 shadow-lg shadow-cyan-500/20'
                    : ''
                }`}
              >

                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-5">

                  <div className="flex-1 min-w-0">

                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h2 className="text-xl sm:text-2xl font-bold text-white break-words">
                        {job.title}
                      </h2>
                      {job.work_type && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          {job.work_type}
                        </span>
                      )}
                    </div>

                    <p className="text-slate-400 mt-2 text-sm sm:text-base">
                      {job.description}
                    </p>

                    <div className="flex items-center gap-2 text-slate-300 mt-3 sm:mt-4 text-xs sm:text-sm">

                      <MapPin className="w-4 h-4 shrink-0 text-slate-400" />

                      <span className="break-words">{job.location}</span>

                    </div>

                    {userLocation && (
                      <div className="text-slate-400 text-xs sm:text-sm mt-2 font-medium flex items-center gap-1.5">
                        <span>📍</span>
                        {job.distanceKm !== undefined ? (
                          <span>
                            Straight-line distance:{' '}
                            <strong className="text-white font-bold">
                              {job.distanceKm.toFixed(1)} km
                            </strong>
                          </span>
                        ) : (
                          <span className="text-slate-500">Distance unavailable</span>
                        )}
                      </div>
                    )}

                    {activeRouteInfo?.jobId === job.id && (
                      <div className="mt-3 p-3 sm:p-3.5 rounded-xl bg-slate-900/95 border border-blue-500/40 space-y-2.5 shadow-sm">
                        {/* Travel Mode Toggle & Clear Option */}
                        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSwitchTravelMode(job, 'DRIVING')}
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                selectedTravelMode === 'DRIVING'
                                  ? 'bg-blue-600 text-white shadow'
                                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                              }`}
                            >
                              <span>🚗</span>
                              <span>Car</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSwitchTravelMode(job, 'BICYCLING')}
                              className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                                selectedTravelMode === 'BICYCLING'
                                  ? 'bg-blue-600 text-white shadow'
                                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                              }`}
                            >
                              <span>🚲</span>
                              <span>Bike</span>
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={handleClearDirections}
                            className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Clear</span>
                          </button>
                        </div>

                        {/* Calculated Route Information */}
                        {directionsLoading ? (
                          <div className="text-xs text-cyan-400 font-medium italic flex items-center gap-1.5 py-1">
                            <span className="animate-spin">⏳</span>
                            <span>Calculating shortest road route...</span>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-[11px] font-bold text-blue-400 uppercase tracking-wide flex items-center gap-1.5">
                              <span>{activeRouteInfo.travelMode === 'BICYCLING' ? '🚲' : '🚗'}</span>
                              <span>
                                {activeRouteInfo.travelMode === 'BICYCLING'
                                  ? 'CALCULATED BICYCLING ROUTE'
                                  : 'CALCULATED DRIVING ROUTE'}
                              </span>
                            </div>
                            {activeRouteInfo.distance && (
                              <p className="text-xs sm:text-sm font-semibold text-blue-300 flex items-center gap-1.5">
                                <span>📍</span>
                                <span>Road Distance:</span>
                                <strong className="text-white font-bold">{activeRouteInfo.distance}</strong>
                              </p>
                            )}
                            {activeRouteInfo.duration && (
                              <p className="text-xs sm:text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                                <span>🕒</span>
                                <span>Estimated Travel Time:</span>
                                <strong className="text-white font-bold">{activeRouteInfo.duration}</strong>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 text-cyan-400 text-xl sm:text-2xl font-bold">
                      ₹{job.wage}/day
                    </div>

                  </div>

                  <div className="w-full lg:w-auto flex flex-wrap items-center justify-between sm:justify-end gap-2 sm:gap-3 pt-3 lg:pt-0 border-t border-slate-800/80 lg:border-0 shrink-0">
                    {job.employer_id && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setReportTarget({
                              id: Number(job.employer_id),
                              name: job.employer_name || 'Employer',
                            })
                          }
                          className="px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                          title="Report Employer"
                        >
                          <Flag className="w-3.5 h-3.5" />
                          <span>Report</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setBlockTarget({
                              id: Number(job.employer_id),
                              name: job.employer_name || 'Employer',
                            })
                          }
                          className="px-2.5 sm:px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 border border-slate-700 hover:border-amber-500/30 text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
                          title="Block Employer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Block</span>
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (activeRouteInfo?.jobId === job.id) {
                          handleClearDirections();
                        } else {
                          handleGetDirections(job);
                        }
                      }}
                      disabled={directionsLoading}
                      className={`px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-xl border text-xs sm:text-sm font-semibold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                        activeRouteInfo?.jobId === job.id
                          ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40'
                          : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/40'
                      }`}
                      title={activeRouteInfo?.jobId === job.id ? 'Clear Directions' : 'Get Directions on Map'}
                    >
                      {activeRouteInfo?.jobId === job.id ? (
                        <>
                          <RotateCcw className="w-4 h-4" />
                          <span>Clear</span>
                        </>
                      ) : (
                        <>
                          <Navigation className="w-4 h-4" />
                          <span>Directions</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() =>
                        handleApply(
                          job.id
                        )
                      }
                      className="px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs sm:text-sm cursor-pointer shadow-md transition"
                    >
                      Apply
                    </button>
                  </div>

                </div>

              </div>

            )
          )

        )}

      </div>

      <ReportModal
        isOpen={!!reportTarget}
        onClose={() => setReportTarget(null)}
        reportedUserId={reportTarget?.id || null}
        reportedUserName={reportTarget?.name}
      />

      <BlockModal
        isOpen={!!blockTarget}
        onClose={() => setBlockTarget(null)}
        blockedUserId={blockTarget?.id || null}
        blockedUserName={blockTarget?.name}
        onSuccess={() => fetchJobs()}
      />

    </div>
  );
}