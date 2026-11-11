// Which places have rows, and the OpenStreetMap object a place's record names. Shared by the Map
// step and by what makes the map data (library/mapgen/), so that both mean the same places.

// The ids of the places that at least one row names, in the order of places.json.
export function placesWithRows(lib) {
  const named = new Set(lib.entries.map((entry) => entry.place).filter(Boolean));
  return Object.keys(lib.places).filter((id) => named.has(id));
}

// 'way/123' -> {kind: 'way', id: 123}; anything else (absent, an address, a typo) -> null.
export function osmRef(value) {
  const match = /^(node|way|relation)\/(\d+)$/.exec(String(value ?? '').trim());
  return match ? { kind: match[1], id: Number(match[2]) } : null;
}
