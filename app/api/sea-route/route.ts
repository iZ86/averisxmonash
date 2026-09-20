import searoute from "searoute-js";

export const runtime = "nodejs";

type LatLng = [number, number];
const cache = new Map<string, LatLng[]>();

function parse(value: string | null): LatLng | null {
  const [lat, lng] = (value ?? "").split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

const point = ([lat, lng]: LatLng) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [lng, lat] } });

export function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const from = parse(params.get("from"));
  const to = parse(params.get("to"));
  if (!from || !to) return Response.json({ error: "from and to must be lat,lng" }, { status: 400 });

  const key = `${from}|${to}`;
  let path = cache.get(key);
  if (!path) {
    const line = searoute(point(from), point(to)) as { geometry: { coordinates: [number, number][] } } | null;
    if (!line) return Response.json({ error: "No sea route found" }, { status: 404 });
    path = [from, ...line.geometry.coordinates.map(([lng, lat]): LatLng => [lat, lng]), to];
    cache.set(key, path);
  }
  return Response.json({ path }, { headers: { "Cache-Control": "private, max-age=86400" } });
}
