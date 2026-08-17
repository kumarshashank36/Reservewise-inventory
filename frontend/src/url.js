import { useCallback, useRef } from 'react';

// Merge a partial patch into the current search params (deleting keys set to
// null/undefined/''). List pages use this to keep page/filter state in the URL.
export function patchSearchParams(setSearchParams, patch) {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === undefined || value === '') next.delete(key);
      else next.set(key, String(value));
    }
    return next;
  });
}

// A stable setParam callback for list pages. react-router's setSearchParams is
// not referentially stable across renders, so wrapping it directly in
// useCallback would still change identity every render and re-trigger effects
// that depend on it (e.g. the debounced search sync). The ref keeps the latest
// setter while the returned callback stays constant.
export function usePatchSearchParams(setSearchParams) {
  const ref = useRef(setSearchParams);
  ref.current = setSearchParams;
  return useCallback((patch) => patchSearchParams(ref.current, patch), []);
}
