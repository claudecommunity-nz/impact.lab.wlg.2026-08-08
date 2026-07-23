import { redirect } from "next/navigation";
import { ModulePageClient } from "../../../../components/ModulePageClient";

/**
 * /modules/[id]/[slug] — a module's sub-page. Same client wrapper as the index
 * route, passed the sub-page slug so it mounts that page's UI.
 */
export default async function ModuleSubPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = await params;

  // Preserve old shared/bookmarked links after the demo scenario was retired.
  if (id === "demo-seed" && slug === "scenario") {
    redirect("/modules/demo-seed");
  }

  return <ModulePageClient id={id} slug={slug} />;
}
