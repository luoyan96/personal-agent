---
name: statistical-result-analysis
description: Analyze research-result files such as CSV, JSON, TSV, experiment logs, or tables and produce a reproducible statistical report. Use for comparing methods, selecting statistical tests, computing uncertainty and effect sizes, checking result tables, or preparing a paper's results section. Do not use to fabricate observations, infer causality from an unsuitable design, or silently choose tests without recording assumptions.
---

# Statistical result analysis

## Intake and data audit

Require input path or supplied table, provenance/version, unit of analysis, hypothesis/estimand, primary metric and direction, comparison groups, pairing/repeated-measure structure, and intended decision. Identify what was independently sampled or assigned: rows, folds, time points and repeated seeds are not automatically independent units. Ask for the missing design fields before choosing a test; a descriptive fallback must name the unanswered question.

Inspect schema, missingness, duplicate IDs, invalid ranges, and transformation needs before analysis. For paired data match by a declared unit key, never by row order or equal group counts. Record unmatched units and duplicate unit/group cells; do not silently average duplicates, impute values or discard incomplete pairs. Save `analysis/data-audit.json` with the input hash/version and exclusions.

For a two-condition table with one measurement per unit/condition, use the optional local [paired audit helper](references/paired-audit.md) when Node.js and file access are available and authorized. It provides deterministic audit counts and descriptive differences, not a statistical test. AcceptCat's current text-only chat cannot run this script: return the proposed audit/plan and explicit missing execution status instead of claiming files or computed results exist. Read only user-selected, currently authorized materials; installing a public method does not grant access to team or private datasets.

## Analysis protocol

1. Write `analysis/plan.md`: estimand, primary test, alternatives, alpha/interval policy, multiple-comparison policy, and diagnostic assumptions.
2. Select tests from design, not metric names: paired data require analysis of within-unit differences; independent groups require independent comparison; repeated measures require a model that accounts for dependence. Shared seeds alone do not establish pairing or population-level replication. For paired inference check the difference distribution and independence between pairs, not separate normality tests of the two groups. A nonparametric test does not repair dependence, selection bias or an undefined estimand. If assumptions cannot be checked, explain an appropriate alternative or remain descriptive.
3. Compute sample counts, central tendency, spread, confidence intervals, effect size with direction, test statistic, p-value where appropriate, and exact data exclusions.
4. Generate machine-readable `analysis/summary.json`, code/notebook reference, and `analysis/report.md` only through available tools. Distinguish proposed, executed and independently checked results; if file output is unavailable, deliver labeled inline drafts. Preserve raw values and seeds; never overwrite inputs. Scope seed-only results to the fixed dataset and setup unless additional sampling supports a broader conclusion.
5. Check reported tables against source metrics and flag impossible precision, missing denominators, or unmatched comparison settings.

## Quality gate

Use [analysis-contract.md](references/analysis-contract.md). Avoid “significant/non-significant” as the sole conclusion; interpret magnitude, uncertainty, and practical relevance. Do not claim causal effects without a causal design and stated assumptions. Do not execute analysis code or install packages without appropriate user approval.
