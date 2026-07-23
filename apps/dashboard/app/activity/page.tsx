import type { Metadata } from "next";

import { ActivityView } from "./activity-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lab activity · WCC Emergency",
  description: "Live team delivery and public platform data for the Wellington Impact Lab.",
};

export default function ActivityPage() {
  return <ActivityView />;
}

