# Local paired-data audit

Use this helper only for two conditions and one numeric observation per declared unit/condition. It checks a supplied design declaration; it cannot discover whether units are independent. For repeated visits, folds, batches, technical replicates or more conditions, preserve those levels and plan the appropriate analysis separately. Equal row counts or matching seed numbers alone do not justify pairing.

## Input and execution

Node.js 22.19+ is the only dependency. No packages, network, credentials, downloads or input mutation are used. From the skill directory, run `node scripts/audit-pairs.mjs --input <approved-json-path>`. The command emits JSON to stdout without creating files. Save stdout only to a new, approved destination if a file is needed. This local helper is not connected to AcceptCat's chat executor; text installation and knowledge binding do not authorize or perform script execution.

Input schema version 1:

```json
{
  "schemaVersion": 1,
  "design": {
    "unitOfAnalysis": "independently sampled synthetic specimen",
    "pairingBasis": "same specimen measured by both devices",
    "independenceBasis": "specimens sampled separately; no shared batch declared",
    "metric": "synthetic measurement in arbitrary units",
    "groupA": "device A",
    "groupB": "device B",
    "missingPolicy": "stop"
  },
  "pairs": [
    {"unitId": "specimen-1", "a": 10, "b": 12},
    {"unitId": "specimen-2", "a": 20, "b": 24},
    {"unitId": "specimen-3", "a": 30, "b": 36}
  ]
}
```

Require nonempty design declarations and distinct condition labels. Unit IDs must be unique nonempty strings. Values are finite JSON numbers or explicit `null`; numeric strings, absent fields, duplicate IDs and unknown fields are rejected. Files are bounded to 1 MiB, regular UTF-8 JSON; malformed inputs produce a generic error without echoing data or local paths. Object keys must be unique in source JSON (the parser rejects duplicate keys). The helper does not infer IDs, coerce strings or read a CSV implicitly; convert an authorized table while preserving its unit key and record that transformation.

`missingPolicy` is either `stop` (any null blocks the summary) or an explicitly chosen `complete-pairs` (exclude the entire affected pair). Missing fields are schema errors, not nulls. Pair ordinals in issues/exclusions are one-based positions in the hashed input array, including a complete partner excluded with a missing observation. Duplicate IDs block rather than pool measurements. No complete pairs or fewer than two usable pairs block the comparative summary. A nonempty audit does not certify the missingness mechanism.

## Output contract

- `status`: `descriptive_only` or `blocked`; valid audit exits 0 or 2 respectively, malformed input/usage/read failures exit 1.
- `inputSha256`: hash of original file bytes; `design` repeats the declaration, without asserting it was verified.
- `counts`: input pairs, complete/incomplete pairs, missing measurements, excluded and usable pairs. Schema-invalid inputs return an error instead of misleading counts.
- `issues` and `excludedPairOrdinals`: reasons and exact pair positions; no raw IDs or measurements are echoed.
- `summary`: mean and sample SD of **B minus A**, plus the usable pair count; null on blocked audit. A positive difference means numerically higher B, not necessarily better. Arithmetic overflow blocks output; never emit JSON null as a substitute for infinity.
- `inference`: always `not_performed`, with p-value and confidence interval null. Neither a zero SD nor a positive mean implies significance, equivalence, generalization or a verified scientific finding.

The sample above gives three pairs, mean difference 4 and sample SD 2. The helper reports no p-value or interval. Keep its report in the same private/team scope as the selected data; only explicitly chosen deliverables belong in shared tasks or public examples.

## Method sources

The paired-difference definition and sample-SD formula follow [NIST: Analysis of paired observations](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm). Preserve blocking factors as described in [NIST: Randomized block designs](https://www.itl.nist.gov/div898/handbook/pri/section3/pri332.htm). These sources inform the method; they do not certify a supplied design or this helper's output. Reviewed 2026-10-19. No upstream skill instructions are copied.
