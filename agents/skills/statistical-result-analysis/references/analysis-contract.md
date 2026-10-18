# Analysis report contract

Report data provenance, unit of analysis, exclusions, missingness, estimand, test/model, assumptions/diagnostics, sample counts, estimates, uncertainty intervals, effect-size definition/direction, multiplicity handling, reproducibility path, and limits.

Use `not estimable` when fields or design are inadequate. Treat normality tests and p-values as inputs to interpretation, not automatic truth labels.

For paired results include the pairing key and rationale, independently sampled/assigned unit, conditions and subtraction order, total/complete/incomplete/excluded pairs, duplicate-cell disposition, missing-data policy, and the population to which uncertainty refers. Technical replicates and repeated train/test splits must retain their grouping; do not increase the inferential sample size by counting their rows as independent.

Separate audit status from inference status. A valid two-condition audit is still descriptive: it does not verify the asserted design, select a test, calculate a p-value/interval, or establish practical importance or causality. When execution is unavailable, list uncomputed fields and proposed artifacts rather than invented numerical results or save receipts. See [paired-audit.md](paired-audit.md) for the bounded helper and its source basis.
