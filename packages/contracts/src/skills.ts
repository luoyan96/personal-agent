import { z } from "zod";
import {
  Id,
  Version,
  Instant,
  ErrorResponse,
  errorStatus,
  data,
} from "./models.js";

const file = z.strictObject({
  path: z.string().min(1).max(400),
  text: z.string().max(120000),
});
export const SkillPackage = z.strictObject({
  name: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/),
  description: z.string().min(1).max(4000),
  release: z.string().max(100),
  instructions: z.string().min(1).max(120000),
  references: z.array(file).max(299),
  requirements: z.array(z.string().max(100)).max(10),
  scriptCount: z.number().int().min(0).max(8000),
  assetCount: z.number().int().min(0).max(8000),
});
export const SkillSource = z.strictObject({
  kind: z.enum(["folder", "zip", "github", "copy"]),
  label: z.string().max(500),
  revision: z.string().max(100).nullable(),
});
export const SkillSelection = z.strictObject({
  id: Id,
  version: Version,
  referencePaths: z.array(z.string().min(1).max(400)).max(8),
  acceptLimitations: z.boolean(),
});
export const SkillSettings = z.strictObject({
  enabled: z.boolean(),
  listed: z.boolean(),
  boundAgentIds: z.array(Id).max(20),
  callMemberIds: z.array(Id).max(50),
  sourceMemberIds: z.array(Id).max(50),
});
export const InstalledSkill = z.strictObject({
  id: Id,
  ownerId: Id,
  name: z.string(),
  description: z.string(),
  release: z.string(),
  version: Version,
  revision: Version,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  source: SkillSource,
  requirements: z.array(z.string()),
  scriptCount: z.number(),
  assetCount: z.number(),
  references: z
    .array(z.strictObject({ path: z.string(), characters: z.number() }))
    .max(299),
  settings: SkillSettings.nullable(),
  enabled: z.boolean(),
  canCall: z.boolean(),
  canReadSource: z.boolean(),
  owned: z.boolean(),
  createdAt: Instant,
  updatedAt: Instant,
});
export type InstalledSkill = z.infer<typeof InstalledSkill>;
export const SkillUse = z.strictObject({
  turnId: Id,
  conversationId: Id,
  skillId: Id,
  name: z.string(),
  release: z.string(),
  revision: Version,
  status: z.string(),
  failure: z.string().nullable(),
  createdAt: Instant,
});
const empty = z.strictObject({}),
  id = z.strictObject({ id: Id }),
  headers = z.strictObject({
    "Idempotency-Key": z.string().regex(/^[A-Za-z0-9_-]{16,128}$/),
  });
function route<
  P extends z.ZodType,
  Q extends z.ZodType,
  B extends z.ZodType,
  R extends z.ZodType
>(
  method: "GET" | "POST",
  path: string,
  params: P,
  query: Q,
  body: B,
  response: R,
  status = 200
) {
  return {
    method,
    path: `/api/v1${path}`,
    stage: "SKILL1" as const,
    implemented: true,
    access: "session",
    status,
    rule: "Explicit private instruction skills; no automatic script execution, publication, model credential sharing or tool authority. Owner version/grants fence in-flight calls. Listings are metadata only; source requires separate grant.",
    idempotent: method !== "GET",
    request: z.strictObject({
      params,
      query,
      body,
      headers: method === "GET" ? empty : headers,
    }),
    response,
    errors: ErrorResponse,
    errorStatuses: errorStatus,
  };
}
export const skillRoutes = {
  installedSkills: route(
    "GET",
    "/skills",
    empty,
    z.strictObject({
      scope: z.enum(["mine", "available", "public"]).default("mine"),
      agentId: Id.optional(),
    }),
    z.null(),
    data(z.array(InstalledSkill).max(100))
  ),
  installSkill: route(
    "POST",
    "/skills",
    empty,
    empty,
    z.strictObject({ package: SkillPackage, source: SkillSource }),
    data(InstalledSkill),
    201
  ),
  skillSource: route(
    "GET",
    "/skills/{id}/source",
    id,
    empty,
    z.null(),
    data(z.strictObject({ skill: InstalledSkill, package: SkillPackage }))
  ),
  updateSkillSettings: route(
    "POST",
    "/skills/{id}/settings",
    id,
    empty,
    SkillSettings.extend({ expectedVersion: Version }),
    data(InstalledSkill)
  ),
  reviseSkill: route(
    "POST",
    "/skills/{id}/revisions",
    id,
    empty,
    z.strictObject({
      expectedVersion: Version,
      package: SkillPackage,
      source: SkillSource,
    }),
    data(InstalledSkill)
  ),
  skillVersions: route(
    "GET",
    "/skills/{id}/versions",
    id,
    empty,
    z.null(),
    data(
      z
        .array(
          z.strictObject({
            revision: Version,
            release: z.string(),
            digest: z.string(),
            createdAt: Instant,
          })
        )
        .max(50)
    )
  ),
  rollbackSkill: route(
    "POST",
    "/skills/{id}/rollback",
    id,
    empty,
    z.strictObject({ expectedVersion: Version, revision: Version }),
    data(InstalledSkill)
  ),
  skillUses: route(
    "GET",
    "/skills/{id}/uses",
    id,
    empty,
    z.null(),
    data(z.array(SkillUse).max(50))
  ),
};
