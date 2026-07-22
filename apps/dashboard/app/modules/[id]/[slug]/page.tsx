"use client";

import { use } from "react";
import { ModulePageClient } from "../../../../components/ModulePageClient";

/**
 * /modules/[id]/[slug] — a module's sub-page. Same client wrapper as the index
 * route, passed the sub-page slug so it mounts that page's UI.
 */
export default function ModuleSubPage({
  params,
}: {
  params: Promise<{ id: string; slug: string }>;
}) {
  const { id, slug } = use(params);
  return <ModulePageClient id={id} slug={slug} />;
}
