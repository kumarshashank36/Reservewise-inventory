import { useEffect, useState } from 'react';

// Returns a debounced copy of `value`: the output only updates after the input
// has been stable for `delay` milliseconds. Used to avoid a request per keystroke.
export function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
