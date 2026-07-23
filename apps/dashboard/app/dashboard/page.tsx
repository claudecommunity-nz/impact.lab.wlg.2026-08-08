import { WidgetDashboard } from "../../components/widgets/WidgetDashboard";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="p-3 md:p-4">
      <WidgetDashboard />
    </div>
  );
}
