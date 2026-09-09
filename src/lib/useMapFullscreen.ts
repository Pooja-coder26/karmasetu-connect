import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseMapFullscreenOptions {
  mapInstanceRef?: React.MutableRefObject<any>;
  containerRef?: React.RefObject<HTMLElement | null>;
  onFullscreenChange?: (isFullscreen: boolean) => void;
  getCenterCoords?: () => { lat: number; lng: number } | null | undefined;
}

/**
 * Hook to manage custom and native Google Maps fullscreen state with
 * complete browser history (popstate) support.
 *
 * Ensures:
 * 1. Opening fullscreen pushes an entry to browser history.
 * 2. Pressing mobile/Android/browser Back closes fullscreen without navigating away.
 * 3. Second Back press navigates normally to the previous route.
 * 4. Closing via Exit button or Esc pops the history entry cleanly so no extra Back press is needed.
 * 5. Handles both custom CSS fullscreen (fixed inset-0) and HTML5 Element.requestFullscreen.
 */
export function useMapFullscreen(options: UseMapFullscreenOptions = {}) {
  const { mapInstanceRef, containerRef, onFullscreenChange, getCenterCoords } = options;
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Keep refs to avoid stale closures in event listeners
  const isFullscreenRef = useRef(false);
  isFullscreenRef.current = isFullscreen;

  // Track if a history state entry was pushed for fullscreen
  const isHistoryPushedRef = useRef(false);

  // Guard flag to prevent double-popping or looping when programmatic history.back() is invoked
  const isProgrammaticBackRef = useRef(false);

  // Helper to trigger Google Maps resize and re-center coords safely
  const triggerMapResize = useCallback(() => {
    setTimeout(() => {
      if (mapInstanceRef?.current && typeof google !== 'undefined' && google.maps) {
        google.maps.event.trigger(mapInstanceRef.current, 'resize');
        if (getCenterCoords) {
          const coords = getCenterCoords();
          if (coords && typeof coords.lat === 'number' && typeof coords.lng === 'number') {
            mapInstanceRef.current.setCenter(coords);
          }
        }
      }
    }, 120);
  }, [mapInstanceRef, getCenterCoords]);

  // Enter fullscreen mode
  const enterFullscreen = useCallback((shouldRequestNative: boolean = true) => {
    if (isFullscreenRef.current) return;

    setIsFullscreen(true);
    isFullscreenRef.current = true;

    // Push history state so Android / mobile Back button will close fullscreen first
    if (!isHistoryPushedRef.current) {
      const currentState = window.history.state || {};
      window.history.pushState({ ...currentState, __mapFullscreen: true }, '');
      isHistoryPushedRef.current = true;
    }

    // Try HTML5 element fullscreen if supported and requested
    if (shouldRequestNative && containerRef?.current && containerRef.current.requestFullscreen) {
      containerRef.current.requestFullscreen().catch(() => {
        // Safe to ignore: CSS fixed inset-0 already provides a seamless fullscreen view
      });
    }

    triggerMapResize();
    onFullscreenChange?.(true);
  }, [containerRef, onFullscreenChange, triggerMapResize]);

  // Exit fullscreen mode
  // @param fromPopState: true if invoked as a direct result of user pressing browser Back
  const exitFullscreen = useCallback((fromPopState: boolean = false) => {
    const isDocFs = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement
    );

    if (!isFullscreenRef.current && !isDocFs) {
      return;
    }

    setIsFullscreen(false);
    isFullscreenRef.current = false;

    // Exit HTML5 fullscreen if active
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if ((document as any).webkitFullscreenElement) {
      (document as any).webkitExitFullscreen?.().catch(() => {});
    }

    // If exit was NOT caused by browser Back, pop the history entry that we pushed
    if (!fromPopState && isHistoryPushedRef.current) {
      isHistoryPushedRef.current = false;
      isProgrammaticBackRef.current = true;
      window.history.back();

      setTimeout(() => {
        isProgrammaticBackRef.current = false;
      }, 150);
    } else if (fromPopState) {
      // Browser Back already popped the entry
      isHistoryPushedRef.current = false;
    }

    triggerMapResize();
    onFullscreenChange?.(false);
  }, [onFullscreenChange, triggerMapResize]);

  const toggleFullscreen = useCallback(() => {
    if (isFullscreenRef.current) {
      exitFullscreen(false);
    } else {
      enterFullscreen(true);
    }
  }, [enterFullscreen, exitFullscreen]);

  // Listen for browser / mobile device Back button (popstate)
  useEffect(() => {
    const handlePopState = () => {
      // If we are executing our own programmatic history.back(), ignore
      if (isProgrammaticBackRef.current) {
        isProgrammaticBackRef.current = false;
        return;
      }

      const isDocFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );

      // If the map is currently in fullscreen or we have a pushed history entry:
      if (isFullscreenRef.current || isHistoryPushedRef.current || isDocFs) {
        // The user pressed Android / browser Back!
        // Close fullscreen and remain on the current page.
        exitFullscreen(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [exitFullscreen]);

  // Listen for native HTML5 fullscreen changes (Esc key, native Google Maps control, etc.)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFs = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement
      );

      if (isDocFs && !isFullscreenRef.current) {
        // Native fullscreen was entered
        enterFullscreen(false);
      } else if (!isDocFs && isFullscreenRef.current) {
        // Native fullscreen was exited (e.g. Esc key or native exit icon)
        exitFullscreen(false);
      } else {
        triggerMapResize();
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [enterFullscreen, exitFullscreen, triggerMapResize]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else if ((document as any).webkitFullscreenElement) {
        (document as any).webkitExitFullscreen?.().catch(() => {});
      }
      isHistoryPushedRef.current = false;
    };
  }, []);

  return {
    isFullscreen,
    setIsFullscreen,
    toggleFullscreen,
    enterFullscreen,
    exitFullscreen,
    triggerMapResize,
  };
}
