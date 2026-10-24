# Skill evaluation matrix

Evaluate artifact behavior rather than prose similarity. Each case must assert trigger boundary, required inputs, tool intent/order, output paths, evidence tracing, and forbidden claims.

| Skill | Success fixture | Boundary fixture | Required assertions |
|---|---|---|---|
| paper-search-pro | paper-search-pro-standard | unavailable source | query/source log, dedup lineage, verified metadata only |
| systematic-literature-review | multi-source screened set | slr-incomplete-screening | protocol, exclusions, thematic—not sequential—synthesis |
| academic-paper-review | parsed manuscript | paper-review-abstract-only | locators, remedy per criticism, review limitations |
| hypothesis-research-loop | small approved pilot | hypothesis-loop-unapproved | pre-registered prediction, immutable run log, approval stop |
| statistical-result-analysis | statistical-analysis-paired | missing design fields | design-appropriate test, interval/effect size, data audit |
| research-writing-and-rebuttal | evidence-mapped revision | writing-rebuttal-missing-evidence | claim map, verified references, no unperformed-work claim |
| research-thesis | bounded thesis with named comparator | research-thesis-no-comparator | falsifier, success criterion, explicit go/no-go |
| novelty-red-team | differentiable claim | novelty-red-team-close-overlap | closest-work evidence, overlap risk, prohibited unsupported novelty language |
| experiment-matrix | approved claim plan | experiment-matrix-metric-drift | claim-to-run traceability, locked primary metric, approval gate |
| iclr-red-team | artifact-backed paper draft | iclr-red-team-unsupported-claim | three review passes, blocker repairs, no acceptance prediction |
| task-decomposition | task-decomposition-bounded-plan; planner-conversation-low-burden | prior work without full scope, user fatigue, cyclic/missing predecessor, unassigned claim | conversational acknowledgment, at most one simple necessary question, existing Plan fields, bounded deliverables/DAG, separate allocation and explicit creation |
| Continuous planning output | planning-reply-recovery | copied Plan metadata, null schedule, invalid research fields, late database failure, cached failure | content-only model boundary, authoritative identity/dates/materials, atomic draft writes, private shape diagnostics, explicit retry without duplicated input or task creation |
| Installed Skill chat routing | skill-continuous-routing | old mixed assistant/Skill route; withdrawn bound evidence | explicit Skill and selected references survive supplements; no implicit delegation/creation; actual reply and source receipt; zero model calls for inconsistent or revoked input |
| Imported Skill text limits | exact-limit instructions and selected reference | oversized ordinary/linked reference, malformed UTF-8, unchanged legacy revision | one API-compatible character limit; exact file path on failure; no truncation; full selected text in synthetic chat; original ZIP/digests and account isolation preserved |

The installed-Skill routing fixture is an HTTP/SQLite/ChatWorker integration check in `apps/api/tests/skills.spec.ts`, using a synthetic model and canonical SLR text. It verifies invocation, evidence selection and saved output; it does not evaluate live-model research quality or execute the Skill's filesystem/search tools.

Task decomposition has a declared scenario in `evaluations/fixtures/task-decomposition-bounded-plan.md`. The actual local checks in `clients/openim/tests/planner-chat.test.mjs` and `dependency-graph.test.mjs` verify canonical text injection, the existing prompt budget and structural graph boundaries. They do not evaluate a real model's decomposition quality; the method currently enters the desktop planning prompt and is not a new server-side Skill deployment.

Imported text boundaries are checked in `packages/research-skills/tests/import-text-limits.spec.ts`, `clients/openim/tests/skill-linked-reference.test.mjs` and the exact-limit HTTP integration case in `apps/api/tests/skills.spec.ts`. Installation size limits remain distinct from the selected chat input budget; see `docs/development/skill-import-text-limits.md` for unchanged-package and release evidence.

## Manual gate

Cross-role conversation and task lifecycle scenarios are declared in [agent-conversation-flow](fixtures/agent-conversation-flow.md), covering all eleven canonical methods and seven starter roles. Automatic checks verify routing/budget, profile reuse, role-aware guidance and unchanged task authority; they do not establish live-model warmth or research judgment. See [implementation scope](../docs/development/agent-conversation-flow.md) for desktop/backend activation boundaries.

Community data/grant review (2026-10-17): `exploratory-data-analysis` is a pending connector, because the actual whole-repository ZIP exceeds the desktop 32MiB limit and script execution is unavailable. Eighteen synthetic CLI cases check bounded CSV/TSV/strict-JSON profiles, missingness, split overlap, sensitivity, redaction, malformed inputs and write/path refusal; these do not certify a dataset, infer causality or prove AcceptCat tool execution. `research-grants` is checked as a private text workflow with supplied current solicitation material, selected proposal-structure references and no automatic submission. The upstream NIH modular-budget increment error and missing current NSFC rules are explicit. Runtime evidence and actual publication state are recorded in `docs/development/research-data-grant-catalog.md`; no upstream Skill body is duplicated here.

Community research planning review (2026-10-16): `scientific-problem-selection` is checked for private installation, full instructions plus only selected risk/decision references, absent live search and cross-account denial. `hypothesis-generation` uses published synthetic templates for schema, rival predictions, measurements, controls, evidence and scaffold validation, with malformed/proven claims, duplicate keys, identical rival expectations and overwrite refusal. English causal lint and a known Chinese miss are recorded separately. Fixed synthetic ChatWorker replies prove routing and saved receipts, not scientific quality, source accuracy, novelty or independent review. Source corrections and raw/ZIP roundtrip evidence are documented in `docs/development/research-question-catalog.md`; no upstream Skill bodies are duplicated here.

- Does the name/description route the task to the right skill and reject its nearest confusion case?
- Are tool parameters deferred to the current plugin schemas?
- Are all material outputs stored with `artifact_save` and traceable to sources or raw data?
- Are expensive, private, destructive, or side-effecting actions held at an explicit approval gate?
- Does degraded output retain uncertainty and coverage limitations?
