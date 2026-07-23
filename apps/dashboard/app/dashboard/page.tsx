import { WidgetDashboard } from "../../components/widgets/WidgetDashboard";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="ops-surface min-h-dvh">
      <div className="mx-auto max-w-[1680px] p-3 md:p-5">
        <WidgetDashboard />
      </div>
    </div>
  );
}
