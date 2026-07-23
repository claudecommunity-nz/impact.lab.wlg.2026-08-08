import { defineModule } from "@wcc-impact/plugin-sdk";

/**
 * newsroom — a full showcase module. A Python loader ingests NZ news RSS/Atom
 * every 5 minutes into this module's OWN tables (m_newsroom_*), publishes each
 * new article as a signal on the shared feed, and a public edge function lets
 * anyone comment with their name, location and a photo. Four pages demonstrate
 * every platform capability: own tables, realtime, the shared map + signals,
 * storage, and edge functions.
 */
export default defineModule({
  contractVersion: 1,
  id: "newsroom",
  name: "Newsroom",
  icon: "newspaper",
  description:
    "Live NZ news ingested every 5 minutes — stored in its own tables, referenced as signals, mapped, and open to public discussion.",
  ui: () => import("./ui"),
  pages: [
    { slug: "map", name: "Map", icon: "map", ui: () => import("./pages/map") },
    { slug: "feeds", name: "Feeds & refreshes", icon: "rss", ui: () => import("./pages/feeds") },
    { slug: "community", name: "Community", icon: "messages-square", ui: () => import("./pages/community") },
  ],
  // Own Postgres tables (backend/schema.sql). Declaring them subscribes each on
  // the shared realtime channel, so useModuleTable(...) is live.
  tables: ["sources", "articles", "refreshes", "comments"],
  homeStat: { label: "News articles", signalType: "news-article" },
});
