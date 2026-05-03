// ─── geo.service.ts ──────────────────────────────────
// Geospatial search utilities using bounding box pre-filter
// and Haversine formula for precise radius filtering.
// No PostGIS required — works with standard PostgreSQL.

const EARTH_RADIUS_KM = 6371;

/**
 * Convert degrees to radians
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Calculate the Haversine distance between two lat/lng points in kilometres.
 */
export function haversineDistanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate a bounding box for a given centre point and radius.
 * Returns min/max lat and lng for use in a WHERE clause.
 *
 * This is used as a fast pre-filter before the more expensive Haversine calculation.
 */
export function getBoundingBox(
  lat: number, lng: number, radiusKm: number
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusKm / EARTH_RADIUS_KM * (180 / Math.PI);
  const lngDelta = radiusKm / (EARTH_RADIUS_KM * Math.cos(toRad(lat))) * (180 / Math.PI);

  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/**
 * Filter an array of records that have `latitude` and `longitude` fields
 * to only those within `radiusKm` of the given centre point.
 *
 * Assumes records have already been pre-filtered by bounding box.
 * Attaches `distanceKm` to each matching record.
 *
 * @param records - Array of objects with optional latitude/longitude fields
 * @param centerLat - Centre latitude
 * @param centerLng - Centre longitude
 * @param radiusKm - Maximum distance in kilometres
 * @returns Filtered and sorted array with `distanceKm` attached
 */
export function geoSearch<T extends { latitude?: number | null; longitude?: number | null }>(
  records: T[],
  centerLat: number,
  centerLng: number,
  radiusKm: number
): (T & { distanceKm: number })[] {
  return records
    .filter(r => r.latitude != null && r.longitude != null)
    .map(r => ({
      ...r,
      distanceKm: haversineDistanceKm(centerLat, centerLng, r.latitude!, r.longitude!),
    }))
    .filter(r => r.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/**
 * Build a Prisma WHERE clause fragment for bounding box pre-filter.
 * Use this in your Prisma query to reduce the result set before in-memory Haversine.
 *
 * Example usage:
 *   const bbox = buildBoundingBoxFilter(lat, lng, radiusKm);
 *   const results = await prisma.property.findMany({ where: { ...bbox, ...otherFilters } });
 *   const precise = geoSearch(results, lat, lng, radiusKm);
 */
export function buildBoundingBoxFilter(lat: number, lng: number, radiusKm: number) {
  const { minLat, maxLat, minLng, maxLng } = getBoundingBox(lat, lng, radiusKm);
  return {
    latitude: { gte: minLat, lte: maxLat },
    longitude: { gte: minLng, lte: maxLng },
  };
}
