/**
 * Matching rule :
 * a static, hand-picked cluster map instead of geodistance/geometry. Two
 * destinations are considered "the same general direction" if they fall in
 * the same cluster below. Clusters are loose real-world Dhaka groupings —
 * not precise, just consistent 
 *
 * This is what lets Nusrat (Banani→Mohakhali) and Rafiq (Banani→Gulshan 1)
 * pool despite different destinations: same origin, both destinations in
 * the "uptown" cluster.
 */
export const ZONE_CLUSTERS: Readonly<Record<string, readonly string[]>> = {
  // Diplomatic zone / airport-road corridor
  uptown: ["Banani", "Gulshan 1", "Mohakhali", "Bashundhara", "Baridhara", "Badda"],
  // Mirpur Road corridor
  mirpurRoadCorridor: ["Dhanmondi", "Farmgate", "Tejgaon"],
  mirpur: ["Mirpur"],
  uttara: ["Uttara"],
  // East-central / old commercial belt
  eastCentral: ["Rampura", "Motijheel"],
};

function clusterOf(zoneName: string): string | undefined {
  return Object.entries(ZONE_CLUSTERS).find(([, zones]) => zones.includes(zoneName))?.[0];
}

/**
 * True if two zone names are the same zone, or both fall in the same
 * cluster. Used to decide whether a new ride request's destination is
 * compatible with a pool's existing destination.
 */
export function sameCluster(zoneNameA: string, zoneNameB: string): boolean {
  if (zoneNameA === zoneNameB) return true;

  const clusterA = clusterOf(zoneNameA);
  const clusterB = clusterOf(zoneNameB);

  return clusterA !== undefined && clusterA === clusterB;
}
