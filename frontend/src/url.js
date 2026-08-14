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
