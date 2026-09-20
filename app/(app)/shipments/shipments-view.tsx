"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, MapPinOff } from "lucide-react";
import { Confidence, ResultBadge } from "@/components/ui";
import { ShipmentGlobe, type GlobeRoute } from "@/components/shipment-globe";
import type { Shipment } from "@/lib/types";

const kg = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-US"));
const orDash = (v: string | null) => v ?? "—";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="font-semibold">{children}</div>
    </div>
  );
}

export function ShipmentsView({ shipments }: { shipments: Shipment[] }) {
  const [selectedId, setSelectedId] = useState(shipments[0]?.id);
  const selected = shipments.find((s) => s.id === selectedId) ?? shipments[0];

  const entry = selected?.entry ?? null;
  const exit = selected?.exit ?? null;
  const route = useMemo<GlobeRoute | null>(
    () =>
      selected && entry && exit
        ? {
            entry: { lat: entry.lat, lng: entry.lng, label: selected.entryPort, country: entry.country },
            exit: { lat: exit.lat, lng: exit.lng, label: selected.exitPort, country: exit.country },
          }
        : null,
    [selected, entry, exit],
  );

  if (!selected) {
    return (
      <div className="card p-12 text-center">
        <h2 className="title">No shipments yet</h2>
        <p className="p">Shipments appear once a comparison has resolved both ports.</p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_344px]">
      <ul className="flex flex-col gap-3" aria-label="Shipments">
        {shipments.map((s) => {
          const on = s.id === selected.id;
          return (
            <li key={s.id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => setSelectedId(s.id)}
              className="card flex w-full flex-col gap-2 p-4 text-left"
              style={on ? { background: "var(--surface-inset)", borderColor: "var(--accent)" } : undefined}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="lbl">{s.label}</span>
                <ResultBadge result={s.result} />
              </span>
              <span className="font-semibold">{s.entryPort} → {s.exitPort}</span>
              <span className="flex items-center justify-between">
                <span className="cap">{s.distanceKm === null ? "—" : `${s.distanceKm.toLocaleString("en-US")} km`} · {kg(s.grossWeightKg)} kg</span>
                {s.confidence !== null && <Confidence score={s.confidence} />}
              </span>
            </button>
            </li>
          );
        })}
      </ul>

      <div className="card relative flex h-[640px] items-center justify-center overflow-hidden p-2">
        <ShipmentGlobe
          route={route}
          ariaLabel={`Globe showing ${selected.label} from ${selected.entryPort} to ${selected.exitPort}`}
        />
        {!route && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-card/90 text-center">
            <MapPinOff size={24} strokeWidth={1.75} aria-hidden className="text-text-subtle" />
            <div className="title">Location unknown</div>
            <p className="cap max-w-xs">
              {[!entry && (selected.entryText ?? "The loading port"), !exit && (selected.exitText ?? "The discharge port")]
                .filter(Boolean)
                .join(" and ")}{" "}
              could not be matched to a known port, so the route is not drawn.
            </p>
          </div>
        )}
      </div>

      <div className="card flex flex-col gap-4 p-5 lg:col-span-2 xl:col-span-1">
        <div>
          <div className="lbl">{selected.label}</div>
          <h2 className="title text-lg leading-[26px]">{selected.entryPort} to {selected.exitPort}</h2>
        </div>
        <span><ResultBadge result={selected.result} /></span>
        {selected.confidence !== null && (
          <div>
            <div className="lbl">Result confidence</div>
            <Confidence score={selected.confidence} showLabel />
          </div>
        )}
        <div className="divider" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="lbl text-accent-text">Entry port</div>
            <div className="font-semibold">{selected.entryPort}</div>
            <div className="cap">{entry?.countryName ?? "Unknown"}</div>
          </div>
          <div>
            <div className="lbl">Exit port</div>
            <div className="font-semibold">{selected.exitPort}</div>
            <div className="cap">{exit?.countryName ?? "Unknown"}</div>
          </div>
        </div>
        <Detail label="Distance (direct)">{selected.distanceKm === null ? "—" : `${selected.distanceKm.toLocaleString("en-US")} km`}</Detail>
        <Detail label="Containers">{orDash(selected.containers)}</Detail>
        <Detail label="Gross weight (kg)">{kg(selected.grossWeightKg)}</Detail>
        <div><div className="lbl">Shipper</div><div>{orDash(selected.shipper)}</div></div>
        <div><div className="lbl">Consignee</div><div>{orDash(selected.consignee)}</div></div>
        <div><div className="lbl">Notify party</div><div>{orDash(selected.notifyParty)}</div></div>
        {selected.emailId && (
          <Link className="btn ghost" href={`/batches?email=${selected.emailId}`}>
            Open email <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}
