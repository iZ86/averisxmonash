export type Coordinates = { lat: number; lng: number };

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Straight-line (great-circle) distance in kilometres. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Points along the great circle between two coordinates (inclusive). */
export function greatCircle(a: Coordinates, b: Coordinates, steps = 48): Coordinates[] {
  const [φ1, λ1, φ2, λ2] = [rad(a.lat), rad(a.lng), rad(b.lat), rad(b.lng)];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
  if (d === 0) return [a];
  const out: Coordinates[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    out.push({ lat: deg(Math.atan2(z, Math.sqrt(x * x + y * y))), lng: deg(Math.atan2(y, x)) });
  }
  return out;
}

export function midpoint(a: Coordinates, b: Coordinates): Coordinates {
  const pts = greatCircle(a, b, 2);
  return pts[1];
}
