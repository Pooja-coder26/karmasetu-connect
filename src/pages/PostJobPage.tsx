import { useEffect, useRef, useState } from 'react';

import {
  Briefcase,
  FileText,
  IndianRupee,
  MapPin,
  PlusCircle,
  CheckCircle,
  Maximize2,
  Minimize2,
  Clock,
} from 'lucide-react';

import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { useAuth } from '../context/AuthContext';
import { getAuthHeaders } from '../lib/authHeader';
import { API_BASE_URL } from '../lib/config';
import {
  searchIndiaLocations,
  searchLocalIndiaPlaces,
  PlaceSuggestion,
} from '../lib/locationSearch';

declare const google: any;

const WORK_TYPES = [
  { value: 'Construction', label: 'Construction' },
  { value: 'Plumbing', label: 'Plumbing' },
  { value: 'Electrical', label: 'Electrical' },
  { value: 'Painting', label: 'Painting' },
  { value: 'Cleaning', label: 'Cleaning' },
  { value: 'Gardening', label: 'Gardening' },
  { value: 'Driver', label: 'Driver' },
  { value: 'Carpentry', label: 'Carpentry' },
  { value: 'Cooking', label: 'Cooking' },
  { value: 'Any Daily Wage Work', label: 'Any Daily Wage Work' },
];

const TIME_OPTIONS = [
  '12:00 AM', '12:30 AM', '01:00 AM', '01:30 AM', '02:00 AM', '02:30 AM',
  '03:00 AM', '03:30 AM', '04:00 AM', '04:30 AM', '05:00 AM', '05:30 AM',
  '06:00 AM', '06:30 AM', '07:00 AM', '07:30 AM', '08:00 AM', '08:30 AM',
  '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM',
  '03:00 PM', '03:30 PM', '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM',
  '09:00 PM', '09:30 PM', '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM',
];

function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return -1;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return -1;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();

  if (ampm === 'AM') {
    if (hours === 12) hours = 0;
  } else if (ampm === 'PM') {
    if (hours !== 12) hours += 12;
  }
  return hours * 60 + minutes;
}



export default function PostJobPage() {
  const { profile } = useAuth();
  const geocoderRef = useRef<any>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const suggestionsContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<any>(null);
  const pinMarkerRef = useRef<any>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    wage: '',
    location: '',
  });

  const [workType, setWorkType] = useState('Construction');

  const [timingFrom, setTimingFrom] = useState('');
  const [timingTo, setTimingTo] = useState('');
  const [timingError, setTimingError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isPlaceSelected, setIsPlaceSelected] = useState(false);

  const [loading, setLoading] = useState(false);
  const [confirmedCoords, setConfirmedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsContainerRef.current &&
        !suggestionsContainerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const searchTimeoutRef = useRef<any>(null);

  const handleLocationInputChange = (val: string) => {
    setForm((prev) => ({ ...prev, location: val }));
    setIsPlaceSelected(false);

    if (val.trim().length >= 1) {
      // Instant local administrative dataset (<1ms)
      const instant = searchLocalIndiaPlaces(val);
      setSuggestions(instant);
      setShowSuggestions(true);

      // Debounced dynamic live lookup for all India places, towns & villages
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(async () => {
        const fullResults = await searchIndiaLocations(val);
        setSuggestions(fullResults);
      }, 250);
    } else {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    setForm((prev) => ({ ...prev, location: suggestion.description }));
    setIsPlaceSelected(true);
    setShowSuggestions(false);
    updatePin({ lat: suggestion.lat, lng: suggestion.lng }, true, suggestion.type);
  };

  const handleFromChange = (val: string) => {
    setTimingFrom(val);
    if (val && timingTo) {
      if (parseTimeToMinutes(timingTo) <= parseTimeToMinutes(val)) {
        setTimingError('"To" time must be later than "From" time.');
      } else {
        setTimingError(null);
      }
    } else {
      setTimingError(null);
    }
  };

  const handleToChange = (val: string) => {
    setTimingTo(val);
    if (timingFrom && val) {
      if (parseTimeToMinutes(val) <= parseTimeToMinutes(timingFrom)) {
        setTimingError('"To" time must be later than "From" time.');
      } else {
        setTimingError(null);
      }
    } else {
      setTimingError(null);
    }
  };

  /* =========================================
     INITIALIZE GOOGLE MAPS ON MOUNT
  ========================================= */
  useEffect(() => {
    let active = true;

    const initMaps = async () => {
      try {
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        if (!apiKey) return;

        setOptions({ key: apiKey, v: 'weekly' });
        const { Geocoder } = (await importLibrary('geocoding')) as any;
        const { Map } = (await importLibrary('maps')) as any;

        if (!active) return;
        geocoderRef.current = new Geocoder();

        if (mapRef.current && !mapInstance.current) {
          mapInstance.current = new Map(mapRef.current, {
            center: { lat: 20.5937, lng: 78.9629 }, // Pan-India initial overview
            zoom: 5,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
          });

          // Allow employer to click anywhere on map to pin/confirm exact location
          mapInstance.current.addListener('click', (e: any) => {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            updatePin({ lat, lng }, false);
          });
        }
      } catch (e) {
        console.warn('Could not initialize Google Maps:', e);
      }
    };

    initMaps();

    return () => {
      active = false;
    };
  }, []);

  /* =========================================
     FULLSCREEN TOGGLE & RESIZE LISTENER
  ========================================= */
  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);

    if (next && panelRef.current && panelRef.current.requestFullscreen) {
      panelRef.current.requestFullscreen().catch(() => {});
    } else if (!next && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    setTimeout(() => {
      if (mapInstance.current && typeof google !== 'undefined' && google.maps) {
        google.maps.event.trigger(mapInstance.current, 'resize');
        if (confirmedCoords) {
          mapInstance.current.setCenter(confirmedCoords);
        }
      }
    }, 120);
  };

  useEffect(() => {
    const handleFsChange = () => {
      const isDocFs = !!document.fullscreenElement;
      setIsFullscreen(isDocFs);
      setTimeout(() => {
        if (mapInstance.current && typeof google !== 'undefined' && google.maps) {
          google.maps.event.trigger(mapInstance.current, 'resize');
          if (confirmedCoords) {
            mapInstance.current.setCenter(confirmedCoords);
          }
        }
      }, 120);
    };

    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
    };
  }, [confirmedCoords]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  /* =========================================
     UPDATE / CONFIRM PIN ON MAP
  ========================================= */
  const updatePin = (
    coords: { lat: number; lng: number },
    shouldPan = false,
    placeType?: string
  ) => {
    setConfirmedCoords(coords);
    setIsConfirmed(true);

    if (mapInstance.current) {
      if (shouldPan) {
        mapInstance.current.panTo(coords);
        const targetZoom =
          placeType === 'state' ? 7 : placeType === 'district' ? 11 : 16;
        mapInstance.current.setZoom(targetZoom);
      }

      if (pinMarkerRef.current) {
        pinMarkerRef.current.setPosition(coords);
      } else if (typeof google !== 'undefined' && google.maps) {
        pinMarkerRef.current = new google.maps.Marker({
          position: coords,
          map: mapInstance.current,
          draggable: true,
          title: 'Confirmed Job Location',
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
        });

        pinMarkerRef.current.addListener('dragend', (evt: any) => {
          const lat = evt.latLng.lat();
          const lng = evt.latLng.lng();
          setConfirmedCoords({ lat, lng });
          setIsConfirmed(true);
        });
      }
    }
  };

  /* =========================================
     DYNAMIC SEARCH / GEOCODING (INDIA-WIDE)
  ========================================= */
  const resolveLocationCoordinates = async (
    locationStr: string
  ): Promise<{ lat: number; lng: number } | null> => {
    const raw = locationStr.trim();
    if (!raw) return null;

    // 1. Try Google Maps Geocoder
    if (geocoderRef.current) {
      try {
        const res = await new Promise<any>((resolve) => {
          geocoderRef.current.geocode(
            { address: raw, componentRestrictions: { country: 'IN' } },
            (results: any, status: string) => {
              if (status === 'OK' && results && results.length > 0) {
                resolve(results[0]);
              } else {
                resolve(null);
              }
            }
          );
        });

        if (res?.geometry?.location) {
          const lat = res.geometry.location.lat();
          const lng = res.geometry.location.lng();
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
          }
        }
      } catch (e) {
        // Fallback
      }
    }

    // 2. OpenStreetMap / Nominatim API (any state, district, city, town, village)
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
        // Next candidate
      }
    }

    return null;
  };



  /* =========================================
     SUBMIT JOB
  ========================================= */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      /* =========================
         GET EXACT JOB COORDINATES
      ========================= */
      let finalLat = confirmedCoords?.lat;
      let finalLng = confirmedCoords?.lng;

      if (
        finalLat === undefined ||
        finalLng === undefined ||
        !Number.isFinite(finalLat) ||
        !Number.isFinite(finalLng) ||
        (finalLat === 0 && finalLng === 0)
      ) {
        // Automatically search and pin if user did not click Search
        const coords = await resolveLocationCoordinates(form.location);
        if (coords) {
          updatePin(coords, true);
          finalLat = coords.lat;
          finalLng = coords.lng;
        }
      }

      if (
        finalLat === undefined ||
        finalLng === undefined ||
        !Number.isFinite(finalLat) ||
        !Number.isFinite(finalLng) ||
        (finalLat === 0 && finalLng === 0)
      ) {
        alert(
          `Could not determine coordinates for "${form.location}". Please enter a valid location name (e.g., city, town, village, or district), or click on the map to pin and confirm the exact location.`
        );
        setLoading(false);
        return;
      }

      /* =========================
         VALIDATE GOOGLE MAPS LOCATION SELECTION
      ========================= */
      if (!isPlaceSelected && !confirmedCoords) {
        const matches = searchLocalIndiaPlaces(form.location);
        if (
          matches.length > 0 &&
          (matches[0].name.toLowerCase() === form.location.trim().toLowerCase() ||
           matches[0].description.toLowerCase() === form.location.trim().toLowerCase())
        ) {
          handleSelectSuggestion(matches[0]);
          finalLat = matches[0].lat;
          finalLng = matches[0].lng;
        } else {
          alert(
            'Please select a location from the Google Maps suggestions dropdown. Arbitrary manually typed locations are not accepted.'
          );
          setLoading(false);
          return;
        }
      }

      console.log('POSTED LOCATION:', form.location);
      console.log('LATITUDE SAVED:', finalLat);
      console.log('LONGITUDE SAVED:', finalLng);

      /* =========================
         VALIDATE WORK TIMING
      ========================= */
      if (!timingFrom || !timingTo) {
        alert('Please select both "From" and "To" working times.');
        setLoading(false);
        return;
      }

      if (parseTimeToMinutes(timingTo) <= parseTimeToMinutes(timingFrom)) {
        alert('End time ("To") must be later than start time ("From").');
        setLoading(false);
        return;
      }

      const timingStr = `Timing: ${timingFrom} to ${timingTo}`;
      const finalDescription = form.description.trim()
        ? `${form.description.trim()} (${timingStr})`
        : timingStr;

      /* =========================
         POST JOB
      ========================= */
      const response = await fetch(`${API_BASE_URL}/add-job`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: form.title,
          work_type: workType || form.title,
          description: finalDescription,
          wage: form.wage,
          location: form.location,
          latitude: finalLat,
          longitude: finalLng,
          employer_id: profile?.id || 1,
        }),
      });

      const data = await response.text();

      if (!response.ok) {
        alert(data);
        setLoading(false);
        return;
      }

      alert('Job Added Successfully');

      setForm({
        title: '',
        description: '',
        wage: '',
        location: '',
      });
      setWorkType('Construction');
      setTimingFrom('');
      setTimingTo('');
      setTimingError(null);
      setIsPlaceSelected(false);
      setSuggestions([]);
      setShowSuggestions(false);
      setConfirmedCoords(null);
      setIsConfirmed(false);
      if (pinMarkerRef.current) {
        pinMarkerRef.current.setMap(null);
        pinMarkerRef.current = null;
      }
      if (mapInstance.current) {
        mapInstance.current.setCenter({ lat: 20.5937, lng: 78.9629 });
        mapInstance.current.setZoom(5);
      }
    } catch (error) {
      console.error(error);
      alert('Job posting failed');
    } finally {
      setLoading(false);
    }
  };

  return (

    <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">

      <div>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
          Post a New Job
        </h1>

        <p className="text-slate-400 mt-1 sm:mt-2 text-sm sm:text-base">
          Fill in the details to hire skilled daily wage workers.
        </p>

      </div>

      <form
        onSubmit={handleSubmit}
        className="glass-card p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6"
      >

        {/* WORK TYPE / CATEGORY */}
        <div>
          <label className="flex items-center gap-2 text-white font-medium mb-2 sm:mb-3 text-sm sm:text-base">
            <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            <span>Work Type / Category</span> <span className="text-red-400">*</span>
          </label>
          <select
            name="workType"
            value={workType}
            onChange={(e) => {
              const selected = e.target.value;
              setWorkType(selected);
              if (!form.title || WORK_TYPES.some((wt) => wt.value === form.title)) {
                setForm((prev) => ({ ...prev, title: selected }));
              }
            }}
            required
            className="w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 cursor-pointer text-sm sm:text-base"
          >
            {WORK_TYPES.map((wt) => (
              <option key={wt.value} value={wt.value} className="bg-slate-800 text-white">
                {wt.label}
              </option>
            ))}
          </select>
        </div>

        {/* JOB TITLE */}

        <div>

          <label className="flex items-center gap-2 text-white font-medium mb-2 sm:mb-3 text-sm sm:text-base">

            <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />

            <span>Job Title</span>

          </label>

          <input
            type="text"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="Construction Worker, Painter..."
            required
            className="w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm sm:text-base"
          />

        </div>

        {/* WORK TIMING (FROM / TO SELECTORS) */}
        <div>
          <label className="flex items-center gap-2 text-white font-medium mb-2 sm:mb-3 text-sm sm:text-base">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
            <span>Work Timing</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 sm:mb-2 font-medium">
                From:
              </label>
              <select
                value={timingFrom}
                onChange={(e) => handleFromChange(e.target.value)}
                required
                className="w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 cursor-pointer text-sm sm:text-base"
              >
                <option value="" disabled className="bg-slate-800 text-slate-400">
                  Select time
                </option>
                {TIME_OPTIONS.map((time) => (
                  <option key={`from-${time}`} value={time} className="bg-slate-800 text-white">
                    {time}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5 sm:mb-2 font-medium">
                To:
              </label>
              <select
                value={timingTo}
                onChange={(e) => handleToChange(e.target.value)}
                required
                className="w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500 cursor-pointer text-sm sm:text-base"
              >
                <option value="" disabled className="bg-slate-800 text-slate-400">
                  Select time
                </option>
                {TIME_OPTIONS.map((time) => (
                  <option key={`to-${time}`} value={time} className="bg-slate-800 text-white">
                    {time}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {timingError && (
            <p className="text-xs text-rose-400 mt-2 flex items-center gap-1.5 font-medium">
              <span>⚠️</span>
              <span>{timingError}</span>
            </p>
          )}

          {timingFrom && timingTo && !timingError && (
            <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1.5 font-medium">
              <span>✓</span>
              <span>Working Hours: {timingFrom} to {timingTo}</span>
            </p>
          )}
        </div>

        {/* DESCRIPTION */}

        <div>

          <label className="flex items-center gap-2 text-white font-medium mb-2 sm:mb-3 text-sm sm:text-base">

            <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />

            <span>Job Description</span>

          </label>

          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            placeholder="Describe work details (optional)..."
            rows={4}
            className="w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm sm:text-base"
          />

        </div>

        {/* WAGE + LOCATION */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">

          <div>

            <label className="flex items-center gap-2 text-white font-medium mb-2 sm:mb-3 text-sm sm:text-base">

              <IndianRupee className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />

              <span>Wage Per Day (₹)</span>

            </label>

            <input
              type="number"
              name="wage"
              value={form.wage}
              onChange={handleChange}
              placeholder="500"
              required
              className="w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-slate-800 border border-slate-700 text-white text-sm sm:text-base"
            />

          </div>

          <div ref={suggestionsContainerRef} className="relative">
            <label className="flex items-center gap-2 text-white font-medium mb-2 sm:mb-3 text-sm sm:text-base">
              <MapPin className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
              <span>Job Location / Address</span>
            </label>

            <div className="relative">
              <input
                type="text"
                name="location"
                value={form.location}
                onChange={(e) => handleLocationInputChange(e.target.value)}
                onFocus={() => {
                  if (form.location.trim().length >= 1) {
                    const res = searchLocalIndiaPlaces(form.location);
                    setSuggestions(res);
                    setShowSuggestions(true);
                  }
                }}
                placeholder="Search location (e.g. Kar, Solade, Hebbal...)"
                required
                autoComplete="off"
                className={`w-full px-4 sm:px-5 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-slate-800 border text-white transition-all text-sm sm:text-base ${
                  isPlaceSelected
                    ? 'border-emerald-500/70 focus:border-emerald-400'
                    : 'border-slate-700 focus:border-cyan-500'
                }`}
              />

              {isPlaceSelected && (
                <span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Verified</span>
                </span>
              )}

              {/* ALL-INDIA AUTOCOMPLETE SUGGESTIONS DROPDOWN */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1.5 sm:mt-2 bg-slate-900/98 backdrop-blur-md border border-slate-700 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden divide-y divide-slate-800">
                  <div className="px-3 sm:px-4 py-2 bg-slate-800/90 text-[10px] sm:text-[11px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> All-India Suggestions
                    </span>
                    <span className="text-slate-400 font-normal lowercase text-[10px]">
                      Click to select
                    </span>
                  </div>

                  <ul className="max-h-64 overflow-y-auto">
                    {suggestions.map((item, idx) => (
                      <li
                        key={`sugg-${idx}-${item.name}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(item);
                        }}
                        className="px-3.5 sm:px-4 py-2.5 sm:py-3 hover:bg-slate-800/90 cursor-pointer transition-colors flex items-start gap-2.5 sm:gap-3 group"
                      >
                        <div className="mt-0.5 w-6 h-6 sm:w-7 sm:h-7 rounded-lg sm:rounded-xl bg-slate-800 group-hover:bg-cyan-500/20 group-hover:text-cyan-400 text-slate-400 flex items-center justify-center shrink-0 transition-colors">
                          <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-white group-hover:text-cyan-300 truncate">
                            {item.name}
                          </p>
                          <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
                            {item.secondary}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-950/80 text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-800">
                    <span>Select from Google Maps suggestions</span>
                    <span className="text-cyan-400 font-medium">Google Maps</span>
                  </div>
                </div>
              )}
            </div>

            {isPlaceSelected ? (
              <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1.5 font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                Selected: <span className="font-semibold truncate">{form.location}</span> (Map centered & pinned)
              </p>
            ) : form.location.trim().length > 0 ? (
              <p className="text-xs text-amber-400/90 mt-2 flex items-center gap-1.5 font-medium">
                <span>⚠️</span>
                <span>Click a suggestion from the dropdown to select this location.</span>
              </p>
            ) : null}
          </div>
        </div>

        {/* INTERACTIVE GOOGLE MAP & EXACT LOCATION CONFIRMATION */}
        <div
          ref={panelRef}
          className={
            isFullscreen
              ? 'fixed inset-0 z-50 bg-slate-950/95 p-3 sm:p-6 flex flex-col gap-3 backdrop-blur-md overflow-hidden'
              : 'space-y-3 p-3.5 sm:p-5 rounded-xl sm:rounded-2xl bg-slate-900/70 border border-slate-700'
          }
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-white font-semibold text-sm sm:text-base flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                Google Map — Confirm Exact Job Location
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                Search a location above, then drag the red pin or click anywhere on the map to confirm the exact worksite.
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              {confirmedCoords && (
                <button
                  type="button"
                  onClick={() => setIsConfirmed(true)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    isConfirmed
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{isConfirmed ? 'Confirmed' : 'Confirm Location'}</span>
                </button>
              )}

              {/* YOUTUBE-STYLE FULLSCREEN TOGGLE BUTTON */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer ${
                  isFullscreen
                    ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-600'
                }`}
                title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand to Fullscreen (⛶)'}
              >
                {isFullscreen ? (
                  <>
                    <Minimize2 className="w-4 h-4" />
                    <span>Exit Fullscreen</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Fullscreen</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* SEARCH BAR INSIDE FULLSCREEN (Convenient for employer in full view) */}
          {isFullscreen && (
            <div className="relative bg-slate-900/90 p-2.5 rounded-xl border border-slate-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => handleLocationInputChange(e.target.value)}
                  placeholder="Search location in India (e.g. Kar, Solade, Hebbal...)..."
                  className="flex-1 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs sm:text-sm"
                />
              </div>

              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-2.5 right-2.5 z-50 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800">
                  <ul className="max-h-52 overflow-y-auto">
                    {suggestions.map((item, idx) => (
                      <li
                        key={`fs-sugg-${idx}-${item.name}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectSuggestion(item);
                        }}
                        className="px-4 py-2.5 hover:bg-slate-800 cursor-pointer flex items-center gap-2.5 text-xs text-white"
                      >
                        <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="font-semibold text-white">{item.name}</span>
                        <span className="text-slate-400 truncate">({item.secondary})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div
            ref={mapRef}
            className={
              isFullscreen
                ? 'flex-1 w-full min-h-[280px] sm:min-h-[350px] rounded-xl overflow-hidden border border-slate-700'
                : 'w-full h-60 sm:h-72 md:h-80 rounded-xl overflow-hidden border border-slate-700'
            }
          />

          {confirmedCoords ? (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs bg-slate-800/80 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl border border-slate-700">
              <span className="text-slate-300 flex items-center gap-1.5 flex-wrap">
                <span>🔴</span> <strong className="text-white">Confirmed Worksite:</strong>
                <span className="text-cyan-400 font-mono">
                  {confirmedCoords.lat.toFixed(6)}, {confirmedCoords.lng.toFixed(6)}
                </span>
              </span>
              <span className="text-emerald-400 font-medium">
                ✓ Ready to save exact location
              </span>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-1">
              Enter a location and click <strong>Search</strong>, or click anywhere on the map to pin the exact worksite.
            </p>
          )}
        </div>

        {/* BUTTON */}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 sm:py-4 rounded-xl sm:rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-base sm:text-lg hover:scale-[1.01] transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-cyan-500/20 cursor-pointer"
        >

          <PlusCircle className="w-5 h-5" />

          <span>{loading ? 'Posting...' : 'Post Job'}</span>

        </button>

      </form>

    </div>
  );
}