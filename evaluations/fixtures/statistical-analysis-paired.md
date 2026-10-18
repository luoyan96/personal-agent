# Input

Use [the synthetic paired table](statistical-analysis-paired.json): three independently sampled specimens measured by devices A and B. Audit the input before planning inference. The declared unit and pairing are scenario inputs, not verified facts about real specimens.

Boundary variants: a null measurement with `stop` versus explicit `complete-pairs`; duplicate unit IDs; one or zero complete pairs; missing pairing/independence declarations; numeric strings; absent values; malformed/duplicate-key JSON; invalid UTF-8; oversized files; arithmetic overflow; zero spread. Also ask about two ML methods with the same 10 seed numbers but no explanation of shared sampled units or train/test design.

# Expected behavior

Run the **packaged** local helper against the synthetic table when local execution is authorized: 3 complete/usable pairs, no exclusions, B minus A mean 4, sample SD 2, input-byte SHA256, exit 0 and `descriptive_only`. The actual helper must preserve the input and report inference `not_performed`, p-value/interval null. A blocked audit exits 2 with summary null; malformed input exits 1. No raw unit IDs, measurements or absolute paths are echoed in diagnostics. Test report counts, numerical results, subtraction reversal, pair permutation, full-pair exclusion, source-byte preservation and error exits, rather than matching prose.

For seed-only input, request the experimental unit, pairing basis and dependence structure, and scope any descriptive comparison to the supplied fixed setup. Do not infer independence or pair by CSV order. Plan a design-appropriate inference separately; an absent interval is explicitly uncomputed, not zero. No live-model scientific quality is established by this deterministic audit.

The AcceptCat chat route remains text-only. It can use the canonical instructions and selected reference text to draft a plan; it cannot run this helper or truthfully claim saved audit files. This fixture is exercised by `packages/research-skills/tests/paired-audit.spec.ts`, not presented as a live-model or integrated chat-execution test.
