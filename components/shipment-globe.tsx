"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinates } from "@/lib/ports";
import { greatCircle, midpoint } from "@/lib/ports";

export type GlobeRoute = {
  entry: Coordinates & { label: string };
  exit: Coordinates & { label: string };
};

type GlobeInstance = import("globe.gl").GlobeInstance;

/** Reads a design token from the element so the globe follows light/dark. */
function token(el: HTMLElement, name: string) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

export function ShipmentGlobe({ route, ariaLabel }: { route: GlobeRoute | null; ariaLabel: string }) {
  const host = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeInstance | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(0); // bumps when the globe (re)applies theme colors

  // Create the globe once.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      try {
        const [{ default: Globe }, { feature }, land] = await Promise.all([
          import("globe.gl"),
          import("topojson-client"),
          import("world-atlas/land-110m.json"),
        ]);
        if (disposed) return;
        const topo = land.default as unknown as Parameters<typeof feature>[0];
        const landGeo = feature(topo, (topo as unknown as { objects: { land: never } }).objects.land) as unknown as {
          features: object[];
        };

        const g = new Globe(el, { animateIn: false })
          .backgroundColor("rgba(0,0,0,0)")
          .showAtmosphere(false)
          .showGraticules(true)
          .hexPolygonsData(landGeo.features)
          .hexPolygonResolution(3)
          .hexPolygonMargin(0.55)
          .hexPolygonUseDots(true)
          .pathPointLat((p) => (p as Coordinates).lat)
          .pathPointLng((p) => (p as Coordinates).lng)
          .pathPointAlt(0.002)
          .pathStroke(1.2)
          .pathDashLength(0.01)
          .pathDashGap(0.02)
          .pathTransitionDuration(0)
          .arcStroke(0.7)
          .arcAltitudeAutoScale(0.35)
          .arcDashLength(1)
          .arcDashGap(0)
          .pointRadius(0.9)
          .pointAltitude(0.012)
          .labelSize(1.4)
          .labelDotRadius(0)
          .labelResolution(3)
          .labelAltitude(0.02);
        g.controls().autoRotate = false;
        g.controls().enableZoom = false;
        globe.current = g;

        const size = () => g.width(el.clientWidth).height(el.clientHeight);
        size();
        const ro = new ResizeObserver(size);
        ro.observe(el);

        const retheme = () => setReady((n) => n + 1);
        const mo = new MutationObserver(retheme);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        mq.addEventListener("change", retheme);
        retheme();

        cleanup = () => {
          ro.disconnect();
          mo.disconnect();
          mq.removeEventListener("change", retheme);
          (g as unknown as { _destructor?: () => void })._destructor?.();
          el.replaceChildren();
          globe.current = null;
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  // Apply theme colors and the selected route.
  useEffect(() => {
    const el = host.current;
    const g = globe.current;
    if (!el || !g) return;

    const dark = document.documentElement.getAttribute("data-theme")
      ? document.documentElement.getAttribute("data-theme") === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    const sea = token(el, "--surface-inset");
    const land = token(el, dark ? "--navy-300" : "--navy-500");
    const accent = token(el, "--accent");
    const action = token(el, "--action");
    const ink = token(el, "--text-strong");

    (g.globeMaterial() as unknown as { color: { set: (c: string) => void } }).color.set(sea);
    g.hexPolygonColor(() => land);

    if (!route) {
      g.arcsData([]).pathsData([]).pointsData([]).labelsData([]);
      return;
    }

    const { entry, exit } = route;
    g.arcsData([{ startLat: entry.lat, startLng: entry.lng, endLat: exit.lat, endLng: exit.lng }])
      .arcStartLat("startLat")
      .arcStartLng("startLng")
      .arcEndLat("endLat")
      .arcEndLng("endLng")
      .arcColor(() => accent);
    g.pathsData([greatCircle(entry, exit)]).pathColor(() => accent);
    g.pointsData([
      { ...entry, color: accent },
      { ...exit, color: action },
    ])
      .pointLat("lat")
      .pointLng("lng")
      .pointColor("color");
    g.labelsData([
      { ...entry, text: `Entry · ${entry.label}` },
      { ...exit, text: `Exit · ${exit.label}` },
    ])
      .labelLat("lat")
      .labelLng("lng")
      .labelText("text")
      .labelColor(() => ink)
      .labelIncludeDot(false);

    const mid = midpoint(entry, exit);
    g.pointOfView({ lat: mid.lat, lng: mid.lng, altitude: 2.3 }, 900);
  }, [route, ready]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={ariaLabel}
      className="h-full min-h-[420px] w-full"
    >
      {failed && (
        <p className="cap p-6 text-center">
          The globe needs WebGL, which is not available here. The route is listed in the panel beside it.
        </p>
      )}
    </div>
  );
}
