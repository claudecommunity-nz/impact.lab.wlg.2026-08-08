"use client";

import { use } from "react";
import { ModulePageClient } from "../../../components/ModulePageClient";

/**
 * /modules/[id] — every module's page. All the logic (registry lookup, dynamic
 * ssr:false mount, error boundary, generated fallback page) lives in
 * ModulePageClient; this file only unwraps the Next 15 params promise.
 */
export default function ModulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ModulePageClient id={id} />;
}
