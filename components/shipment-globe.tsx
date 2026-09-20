"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinates } from "@/lib/ports";
import countries from "@/lib/geo/countries.json";
import { greatCircle } from "@/lib/ports";

export type GlobeRoute = {
  entry: Coordinates & { label: string; country?: string };
  exit: Coordinates & { label: string; country?: string };
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
        const [{ default: Globe }, { feature }, countries, small] = await Promise.all([
          import("globe.gl"),
          import("topojson-client"),
          import("world-atlas/countries-110m.json"),
          import("@/lib/geo/small-countries.json"),
        ]);
        if (disposed) return;
        const topo = countries.default as unknown as Parameters<typeof feature>[0];
        const countriesGeo = feature(
          topo,
          (topo as unknown as { objects: { countries: never } }).objects.countries,
        ) as unknown as { features: object[] };
        // Countries too small for the 110m map (e.g. Singapore); add more here as ports appear.
        const features = [...countriesGeo.features, ...(small.default as { features: object[] }).features];

        const g = new Globe(el, { animateIn: false })
          .backgroundColor("rgba(0,0,0,0)")
          .showAtmosphere(true)
          .atmosphereAltitude(0.12)
          .showGraticules(false)
          .polygonsData(features)
          .polygonAltitude(0.006)
          .polygonSideColor(() => "rgba(0,0,0,0)")
          .polygonsTransitionDuration(0)
          .pathPointLat((p) => (p as Coordinates).lat)
          .pathPointLng((p) => (p as Coordinates).lng)
          .pathPointAlt(0.012)
          .pathStroke(1.4)
          .pathDashLength(0.04)
          .pathDashGap(0.02)
          .pathDashAnimateTime(9000)
          .pathTransitionDuration(0)
          .pointRadius(0.55)
          .pointAltitude(0.014)
          .ringMaxRadius(4)
          .ringPropagationSpeed(2)
          .ringRepeatPeriod(1400)
          .ringAltitude(0.01)
          .htmlAltitude(0.03);
        g.controls().autoRotate = false;
        g.controls().enableZoom = true;
        g.controls().minDistance = 130;
        g.controls().maxDistance = 500;
        g.controls().zoomSpeed = 0.8;
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
    const sea = dark ? "#0e1a33" : "#d5e1f2";
    const land = dark ? "#41629c" : "#8fa9d1";
    const border = dark ? "#0e1a33" : "#f1f5fb";
    const accent = token(el, "--accent");
    const entryColor = accent;
    const exitColor = "#2fb8ff";

    (g.globeMaterial() as unknown as { color: { set: (c: string) => void } }).color.set(sea);
    const entryLand = "#e0802f";
    const exitLand = "#2b9fe0";
    // Map features carry the ISO 3166-1 numeric code as their id ("068"), so match on that.
    const idOf = (d: object) => String((d as { id?: string | number }).id ?? "").padStart(3, "0");
    const numeric = (iso2?: string) => (iso2 ? (countries as Record<string, { num: string | null }>)[iso2]?.num : undefined);
    const entryId = numeric(route?.entry.country);
    const exitId = numeric(route?.exit.country);
    g.polygonCapColor((d) => {
      const id = idOf(d);
      if (id === entryId) return entryLand;
      if (id === exitId) return exitLand;
      return land;
    }).polygonStrokeColor(() => border);
    g.atmosphereColor(dark ? "#5f86c9" : "#7f9bcc");

    if (!route) {
      g.pathsData([]).pointsData([]).ringsData([]).htmlElementsData([]);
      return;
    }

    const { entry, exit } = route;
    let cancelled = false;

    (async () => {
      let seaPath: Coordinates[];
      try {
        const res = await fetch(`/api/sea-route?from=${entry.lat},${entry.lng}&to=${exit.lat},${exit.lng}`);
        if (!res.ok) throw new Error("no route");
        const { path } = (await res.json()) as { path: [number, number][] };
        seaPath = path.map(([lat, lng]) => ({ lat, lng }));
      } catch {
        seaPath = greatCircle(entry, exit);
      }
      if (cancelled) return;
      g.pathsData([seaPath]).pathColor(() => accent);
      const mid = seaPath[Math.floor(seaPath.length / 2)];
      g.pointOfView({ lat: mid.lat, lng: mid.lng, altitude: 2.3 }, 900);
    })();

    const ports = [
      { ...entry, color: entryColor, role: "Entry" },
      { ...exit, color: exitColor, role: "Exit" },
    ];
    g.pointsData(ports).pointLat("lat").pointLng("lng").pointColor("color");
    g.ringsData(ports)
      .ringLat("lat")
      .ringLng("lng")
      .ringColor((d: object) => () => (d as { color: string }).color);
    g.htmlElementsData(ports)
      .htmlLat("lat")
      .htmlLng("lng")
      .htmlElement((d) => {
        const p = d as (typeof ports)[number];
        const pill = document.createElement("div");
        pill.style.cssText =
          "pointer-events:none;transform:translate(-50%,-140%);display:flex;align-items:center;gap:6px;" +
          "padding:4px 10px;border-radius:9999px;background:#0b1428;color:#fff;font:600 12px/16px system-ui,sans-serif;" +
          `white-space:nowrap;border:2px solid ${p.color};box-shadow:0 2px 8px rgba(0,0,0,.4)`;
        const dot = document.createElement("span");
        dot.style.cssText = `width:8px;height:8px;border-radius:9999px;background:${p.color}`;
        const text = document.createElement("span");
        text.textContent = `${p.role} · ${p.label}`;
        pill.append(dot, text);
        return pill;
      });

    return () => {
      cancelled = true;
    };
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
