import type { Metadata } from "next";
import { PageHeader, SampleBadge } from "@/components/ui";
import { shipments } from "@/lib/mock/data";
import { ShipmentsView } from "./shipments-view";

export const metadata: Metadata = { title: "Shipments · Averis x Monash" };

export default function ShipmentsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Shipments"
        title="Shipments"
        description="Each shipment traced from its entry port to its exit port."
        actions={<SampleBadge />}
      />
      <ShipmentsView shipments={shipments} />
    </>
  );
}
