import { HomeView } from "./home-view";

// Realtime dashboard — never statically prerendered. force-dynamic skips
// build-time static generation (which can't run the client-only map/realtime
// anyway) and renders at request time, exactly like dev.
export const dynamic = "force-dynamic";

/**
 * Home = the common operating picture. Thin server entry so the route can opt
 * out of static generation; all the UI lives in the client <HomeView />.
 */
export default function HomePage() {
  return <HomeView />;
}
