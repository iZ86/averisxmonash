"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, MapPinOff, Search, Filter, AlertCircle, Package, Weight } from "lucide-react";
import { CategoryChip, ResultBadge } from "@/components/ui";
import { fmtShort } from "@/lib/batches/format";
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
  const [selectedId, setSelectedId] = useState<string | undefined>(shipments[0]?.id);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Filter shipments based on location search & status filter
  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      if (
        statusFilter !== "ALL" &&
        s.result?.toLowerCase() !== statusFilter.toLowerCase()
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const entryPort = s.entryPort?.toLowerCase() ?? "";
        const exitPort = s.exitPort?.toLowerCase() ?? "";
        const entryCountry = s.entry?.countryName?.toLowerCase() ?? "";
        const exitCountry = s.exit?.countryName?.toLowerCase() ?? "";
        const subject = s.subject?.toLowerCase() ?? "";
        const label = s.label?.toLowerCase() ?? "";

        const matches =
          entryPort.includes(q) ||
          exitPort.includes(q) ||
          entryCountry.includes(q) ||
          exitCountry.includes(q) ||
          subject.includes(q) ||
          label.includes(q);

        if (!matches) return false;
      }

      return true;
    });
  }, [shipments, statusFilter, searchQuery]);

  // Calculate dynamic metrics based on filtered results
  const metrics = useMemo(() => {
    let totalWeight = 0;
    let totalContainers = 0;
    let needsReviewCount = 0;

    filteredShipments.forEach((s) => {
      if (s.grossWeightKg) totalWeight += s.grossWeightKg;
      if (s.result?.toLowerCase() === "needs_review") needsReviewCount += 1;
      
      // Extract the number of containers from strings like "6 x 40'HC"
      if (s.containers) {
        const match = s.containers.match(/^(\d+)/);
        if (match) totalContainers += parseInt(match[1], 10);
      }
    });

    return { totalWeight, totalContainers, needsReviewCount };
  }, [filteredShipments]);

  // Fallback to the first matching shipment if the selected one is filtered out
  const selected =
    filteredShipments.find((s) => s.id === selectedId) ?? filteredShipments[0];

  const entry = selected?.entry ?? null;
  const exit = selected?.exit ?? null;
  const route = useMemo<GlobeRoute | null>(
    () =>
      selected && entry && exit
        ? {
            entry: {
              lat: entry.lat,
              lng: entry.lng,
              label: selected.entryPort,
              country: entry.country,
            },
            exit: {
              lat: exit.lat,
              lng: exit.lng,
              label: selected.exitPort,
              country: exit.country,
            },
          }
        : null,
    [selected, entry, exit],
  );

  if (!shipments || shipments.length === 0) {
    return (
      <div className="card p-12 text-center">
        <h2 className="title">No shipments yet</h2>
        <p className="p">Shipments appear once a comparison has resolved both ports.</p>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[372px_minmax(0,1fr)] xl:grid-cols-[372px_minmax(0,1fr)_344px]">
      <section className="card flex flex-col overflow-hidden" aria-label="Shipments">
        
        {/* Metrics Dashboard */}
        <div className="grid grid-cols-2 gap-2 border-b border-border bg-surface-card p-3.5">
          <div className="flex flex-col gap-1 rounded-md bg-surface-inset p-2.5">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              <Weight size={12} /> Total Weight
            </span>
            <span className="text-sm font-bold text-text-main">
              {metrics.totalWeight > 0 ? `${metrics.totalWeight.toLocaleString("en-US")} kg` : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-1 rounded-md bg-surface-inset p-2.5">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              <Package size={12} /> Containers
            </span>
            <span className="text-sm font-bold text-text-main">
              {metrics.totalContainers > 0 ? metrics.totalContainers : "—"}
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border p-3.5">
          <div className="flex items-center justify-between">
            <b className="text-sm font-semibold">
              {filteredShipments.length.toLocaleString("en-US")} of{" "}
              {shipments.length.toLocaleString("en-US")} results
            </b>
            {metrics.needsReviewCount > 0 && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-500">
                <AlertCircle size={12} /> {metrics.needsReviewCount} need review
              </span>
            )}
          </div>

          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
              size={15}
            />
            <input
              type="text"
              placeholder="Search location or port..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-inset py-1.5 pl-8 pr-3 text-xs placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter size={14} className="shrink-0 text-text-subtle" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-inset px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="ALL">All status results</option>
              <option value="needs_review">Needs review</option>
              <option value="no_mismatch">No mismatch detected</option>
              <option value="mismatch_found">Mismatch found</option>
            </select>
          </div>
        </div>

        {/* Shipments List */}
        <div className="max-h-[480px] overflow-y-auto divide-y divide-border">
          {filteredShipments.length === 0 ? (
            <div className="p-6 text-center text-xs text-text-muted">
              No shipments match your search or filters.
            </div>
          ) : (
            filteredShipments.map((s) => {
              const on = selected && s.id === selected.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-current={on}
                  onClick={() => setSelectedId(s.id)}
                  className={`relative flex w-full flex-col gap-0.5 px-4.5 py-3.5 pl-5 text-left transition-colors ${
                    on ? "bg-surface-inset" : "hover:bg-surface-inset"
                  }`}
                >
                  {on && (
                    <span className="absolute inset-y-0 left-0 w-[3px] bg-accent" />
                  )}
                  <span className="truncate text-[14.5px] font-semibold">
                    {s.subject ?? `${s.entryPort} → ${s.exitPort}`}
                  </span>
                  <span className="flex justify-between gap-2.5 text-xs text-text-muted">
                    <span className="truncate">{s.sender ?? s.label}</span>
                    {s.receivedAt && (
                      <span className="shrink-0" suppressHydrationWarning>
                        {fmtShort(s.receivedAt)}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-text-muted">
                    {s.entryPort} → {s.exitPort} ·{" "}
                    {s.distanceKm === null
                      ? "—"
                      : `${s.distanceKm.toLocaleString("en-US")} km`}{" "}
                    · {kg(s.grossWeightKg)} kg
                  </span>
                  <span className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <CategoryChip category="document_comparison" />
                    <ResultBadge result={s.result} />
                  </span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Details & Globe View */}
      {selected ? (
        <>
          <div className="card relative flex h-[640px] items-center justify-center overflow-hidden p-2">
            <ShipmentGlobe
              route={route}
              ariaLabel={`Globe showing ${selected.label} from ${selected.entryPort} to ${selected.exitPort}`}
            />
            {!route && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-card/90 text-center">
                <MapPinOff
                  size={24}
                  strokeWidth={1.75}
                  aria-hidden
                  className="text-text-subtle"
                />
                <div className="title">Location unknown</div>
                <p className="cap max-w-xs">
                  {[
                    !entry && (selected.entryText ?? "The loading port"),
                    !exit && (selected.exitText ?? "The discharge port"),
                  ]
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
              <h2 className="title text-lg leading-[26px]">
                {selected.entryPort} to {selected.exitPort}
              </h2>
            </div>
            <span>
              <ResultBadge result={selected.result} />
            </span>
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
            <Detail label="Distance (direct)">
              {selected.distanceKm === null
                ? "—"
                : `${selected.distanceKm.toLocaleString("en-US")} km`}
            </Detail>
            <Detail label="Containers">{orDash(selected.containers)}</Detail>
            <Detail label="Gross weight (kg)">{kg(selected.grossWeightKg)}</Detail>
            <div>
              <div className="lbl">Shipper</div>
              <div>{orDash(selected.shipper)}</div>
            </div>
            <div>
              <div className="lbl">Consignee</div>
              <div>{orDash(selected.consignee)}</div>
            </div>
            <div>
              <div className="lbl">Notify party</div>
              <div>{orDash(selected.notifyParty)}</div>
            </div>
            {selected.emailId && (
              <Link
                className="btn ghost"
                href={`/batches?tab=comparison&email=${selected.emailId}`}
              >
                Open email <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
              </Link>
            )}
          </div>
        </>
      ) : (
        <div className="card col-span-2 flex h-[640px] flex-col items-center justify-center p-8 text-center text-text-muted">
          <p>No shipments match the selected location or status filters.</p>
        </div>
      )}
    </div>
  );
}