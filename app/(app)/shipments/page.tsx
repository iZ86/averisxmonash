import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { getShipments } from "@/lib/shipments";
import { ShipmentsView } from "./shipments-view";

export const metadata: Metadata = { title: "Shipments · APRIL Group" };
export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const shipments = await getShipments();
  return (
    <>
      <PageHeader
        eyebrow="Shipments"
        title="Shipments"
        description="Each shipment traced from its entry port to its exit port."
      />
      <ShipmentsView shipments={shipments} />
    </>
  );
}
