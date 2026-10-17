import type { ResponseFor } from "@research-agent-platform/contracts";
import { researchCategories, type ResearchCategory } from "./capability-center";
import { communityFeedCopy } from "./capability-feed-copy";
import { matchingCommunityEntries } from "./community-research-catalog";

type Catalog = ResponseFor<"communityCatalog">["data"];
export type DiscoveryOrder = "recommended" | "popular" | "latest";
export type DiscoveryPreferences = {
  categories: ResearchCategory[];
  keywords: string[];
};
export type DiscoveryItem = (
  | { kind: "reviewed"; entry: Catalog["entries"][number] }
  | { kind: "candidate"; candidate: Catalog["candidates"][number] }
) & {
  key: string;
  stars: number | null;
  pushedAt: string | null;
  relevance: number;
  reason: string;
};
export const emptyDiscoveryPreferences = (): DiscoveryPreferences => ({
  categories: [],
  keywords: [],
});
const topics: [ResearchCategory, RegExp][] = [
  [
    "文献与阅读",
    /文献|检索|阅读|摘要|literature|paperqa|zotero|pubmed|bibliograph|systematic.review|retrieval/i,
  ],
  [
    "写作与表达",
    /写作|润色|投稿|翻译|writing|manuscript|peer.review|citation|proofread/i,
  ],
  [
    "研究设计",
    /研究设计|实验设计|选题|假设|申请书|hypothes|research.design|research.question|grant|experiment.design/i,
  ],
  ["图表与可视化", /图表|可视化|绘图|图注|visualiz|figure|diagram|plotting/i],
  ["数据与代码", /数据|代码|统计|data|statistic|python|analysis|bioinform|coding/i],
  [
    "课题协作",
    /课题组|协作|组会|任务|collaborat|lab.management|project.management|team|workflow/i,
  ],
];
export function normalizeDiscoveryPreferences(value: unknown): DiscoveryPreferences {
  if (!value || typeof value !== "object") return emptyDiscoveryPreferences();
  const input = value as Record<string, unknown>;
  return {
    categories: [
      ...new Set(
        Array.isArray(input.categories)
          ? input.categories.filter(
              (v): v is ResearchCategory =>
                typeof v === "string" &&
                v !== "全部" &&
                researchCategories.includes(v as ResearchCategory),
            )
          : [],
      ),
    ].slice(0, 6),
    keywords: [
      ...new Set(
        Array.isArray(input.keywords)
          ? input.keywords
              .filter((v): v is string => typeof v === "string")
              .map((v) => v.trim().slice(0, 40))
              .filter((v) => v.length >= 2)
          : [],
      ),
    ].slice(0, 8),
  };
}
const preferenceKey = (actorId: string) =>
  `acceptcat:community-discovery:v1:${actorId}`;
export function readDiscoveryPreferences(
  storage: Pick<Storage, "getItem">,
  actorId: string,
) {
  try {
    const value = JSON.parse(storage.getItem(preferenceKey(actorId)) || "null");
    return value?.schema === 1
      ? normalizeDiscoveryPreferences(value)
      : emptyDiscoveryPreferences();
  } catch {
    return emptyDiscoveryPreferences();
  }
}
export function saveDiscoveryPreferences(
  storage: Pick<Storage, "setItem">,
  actorId: string,
  preferences: DiscoveryPreferences,
) {
  storage.setItem(
    preferenceKey(actorId),
    JSON.stringify({ schema: 1, ...normalizeDiscoveryPreferences(preferences) }),
  );
}
const githubOnly = (repository: string) =>
  /^https:\/\/github\.com\/[^/?#]+\/[^/?#]+\/?$/i.test(repository);
const repositoryKey = (repository: string) =>
  repository.replace(/\/$/, "").toLowerCase();
const updated = (time: string | null) =>
  time && Number.isFinite(Date.parse(time)) ? Date.parse(time) : -1;

export function rankCommunityDiscovery(
  catalog: Catalog | undefined,
  options: {
    category: ResearchCategory;
    search: string;
    order: DiscoveryOrder;
    preferences: DiscoveryPreferences;
    expertise: readonly string[];
  },
): DiscoveryItem[] {
  const { category, order, preferences } = options;
  const search = options.search.trim().toLowerCase();
  const reviewedRepositories = new Set(
    (catalog?.entries || [])
      .filter((e) => githubOnly(e.repository))
      .map((e) => repositoryKey(e.repository)),
  );
  const items: DiscoveryItem[] = [];
  const relevance = (
    text: string,
    categories: ResearchCategory[],
    available: boolean,
    reviewed: boolean,
  ) => {
    const topic = preferences.categories.find((c) => categories.includes(c));
    const keyword = preferences.keywords.find((k) => text.includes(k.toLowerCase()));
    const expertise = options.expertise.find(
      (k) => k.trim().length >= 2 && text.includes(k.trim().toLowerCase()),
    );
    const score =
      preferences.categories.filter((c) => categories.includes(c)).length * 40 +
      preferences.keywords.filter((k) => text.includes(k.toLowerCase())).length * 12 +
      options.expertise
        .slice(0, 20)
        .filter((k) => k.trim().length >= 2 && text.includes(k.trim().toLowerCase()))
        .length *
        8;
    return {
      relevance: score,
      reason: topic
        ? `与你关注的「${topic}」相关`
        : keyword
        ? `匹配关注词「${keyword}」`
        : expertise
        ? `匹配公开专长「${expertise}」`
        : available
        ? "已审阅 · 可安装文字流程"
        : reviewed
        ? "已收录的科研来源"
        : "GitHub 新发现 · 待审阅",
    };
  };
  for (const entry of matchingCommunityEntries(
    catalog?.entries || [],
    category,
    search,
  )) {
    if (!githubOnly(entry.repository)) continue;
    const copy = communityFeedCopy[entry.id];
    const text = [
      entry.name,
      entry.summary,
      entry.input,
      entry.deliverables,
      entry.category,
      copy?.title,
      copy?.outcomes,
    ]
      .join(" ")
      .toLowerCase();
    items.push({
      kind: "reviewed",
      entry,
      key: `reviewed:${entry.id}`,
      stars: entry.github?.stars ?? null,
      pushedAt: entry.github?.pushedAt ?? null,
      ...relevance(text, [entry.category], entry.installable, true),
    });
  }
  const candidateRepositories = new Set<string>();
  for (const candidate of catalog?.candidates || []) {
    const repository = repositoryKey(candidate.repository);
    if (
      !githubOnly(candidate.repository) ||
      reviewedRepositories.has(repository) ||
      candidateRepositories.has(repository)
    )
      continue;
    candidateRepositories.add(repository);
    const text = `${candidate.name} ${candidate.description || ""}`.toLowerCase();
    const categories = topics
      .filter(([, pattern]) => pattern.test(text))
      .map(([name]) => name);
    if (
      !text.includes(search) ||
      (category !== "全部" && !categories.includes(category))
    )
      continue;
    items.push({
      kind: "candidate",
      candidate,
      key: `candidate:${repository}`,
      stars: candidate.stars,
      pushedAt: candidate.pushedAt,
      ...relevance(text, categories, false, false),
    });
  }
  const availability = (item: DiscoveryItem) =>
    item.kind === "reviewed"
      ? item.entry.github?.archived
        ? -1
        : item.entry.installable
        ? 2
        : 1
      : 0;
  return items.sort((a, b) => {
    const stars = (b.stars ?? -1) - (a.stars ?? -1),
      date = updated(b.pushedAt) - updated(a.pushedAt);
    if (order === "popular") return stars || date || a.key.localeCompare(b.key);
    if (order === "latest") return date || stars || a.key.localeCompare(b.key);
    return (
      b.relevance - a.relevance ||
      availability(b) - availability(a) ||
      stars ||
      date ||
      a.key.localeCompare(b.key)
    );
  });
}
