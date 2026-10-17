import type { ResponseFor } from "@research-agent-platform/contracts";
import type { ResearchCategory } from "./capability-center";
import { communityFeedCopy } from "./capability-feed-copy";
export type CommunityResearchEntry =
  ResponseFor<"communityCatalog">["data"]["entries"][number];
export function communitySourceUrl(
  entry: Pick<CommunityResearchEntry, "repository" | "revision" | "sourcePath">,
) {
  return `${entry.repository}/tree/${entry.revision}/${entry.sourcePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}
export function matchingCommunityEntries(
  entries: readonly CommunityResearchEntry[],
  category: ResearchCategory,
  search: string,
) {
  const query = search.trim().toLocaleLowerCase();
  return entries.filter(
    (entry) =>
      (category === "全部" || category === entry.category) &&
      [
        entry.name,
        entry.author,
        entry.summary,
        entry.input,
        entry.deliverables,
        entry.category,
        entry.id,
        communityFeedCopy[entry.id]?.title,
        communityFeedCopy[entry.id]?.outcomes,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
  );
}
