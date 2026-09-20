/** UN/LOCODE -> coordinates for ports the pipeline can resolve. Extend as new ports appear. */
export const PORTS: Record<string, { name: string; country: string; lat: number; lng: number }> = {
  MYPKG: { name: "Port Klang", country: "MY", lat: 3.0, lng: 101.39 },
  MYPEN: { name: "Penang", country: "MY", lat: 5.41, lng: 100.34 },
  SGSIN: { name: "Singapore", country: "SG", lat: 1.26, lng: 103.84 },
  CNSHA: { name: "Shanghai", country: "CN", lat: 31.23, lng: 121.47 },
  NLRTM: { name: "Rotterdam", country: "NL", lat: 51.92, lng: 4.48 },
  DEHAM: { name: "Hamburg", country: "DE", lat: 53.55, lng: 9.99 },
  USLAX: { name: "Los Angeles", country: "US", lat: 33.74, lng: -118.27 },
  AUMEL: { name: "Melbourne", country: "AU", lat: -37.83, lng: 144.92 },
  AEJEA: { name: "Jebel Ali", country: "AE", lat: 25.01, lng: 55.06 },
};

/** ISO 3166-1 alpha-2 -> country name as spelled in the world-atlas map data. */
export const COUNTRY_NAME: Record<string, string> = {
  MY: "Malaysia",
  SG: "Singapore",
  CN: "China",
  NL: "Netherlands",
  DE: "Germany",
  US: "United States of America",
  AU: "Australia",
  AE: "United Arab Emirates",
};

export type Coordinates = { lat: number; lng: number };

/** Returns null when the port cannot be resolved so the UI can show "location unknown". */
export function locate(locode: string): (Coordinates & { name: string; country: string }) | null {
  return PORTS[locode.toUpperCase()] ?? null;
}

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

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
