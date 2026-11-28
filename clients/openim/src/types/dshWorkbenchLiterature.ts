import type { LiteratureRecommendationFeed, LiteratureRecommendationItem } from "@research-agent-platform/contracts";

export type WorkbenchLiteratureFeed = Pick<LiteratureRecommendationFeed, "directions" | "updatedAt"> & {
  source: LiteratureRecommendationFeed["source"] | "unavailable";
  items: Pick<LiteratureRecommendationItem, "id" | "title" | "authors" | "reason" | "summary" | "published">[];
  stale?: boolean;
};

export type WorkbenchLiteratureBridge = {
  listRecommendations(options?: { refresh?: boolean }): Promise<WorkbenchLiteratureFeed>;
};
