# Explicit Skill with continuous research input

## Inputs and execution scope

Install a text Skill privately, bind it to the owner's local Agent, and explicitly select its revision and reference paths. Send the first message and supplement within the existing continuous-message merge window. Use synthetic content and a synthetic model; never use personal documents or real provider credentials.

Cases:

1. First message: `创建一个文献整理 Agent，给出研究问题和纳入标准`. Supplement: `补充：先按技能整理输入条件`.
2. First message: `请帮我研究合成材料中的方法差异`. Supplement: `补充：缺失的证据单独列出`.
3. First message: `背景：下面只使用提供的合成材料`. Supplement: `请帮我制定研究问题和筛选表`.
4. Load the canonical systematic-literature-review instructions and selected `references/slr-checklist.md`. Bind a private TXT source with synthetic S1 (no comparator) and S2 (abstract only). Send a review request and supplement that S2 has no full text.
5. Repeat case 4 but withdraw the bound collection before model execution.
6. Emulate an old persisted Skill request with `purpose=create_agent` or `assistantMode=coordinate` and `personalAssistant=true`.

## Required assertions

- Cases 1–4 keep both submitted messages in one turn, one Skill revision/use, and the exact selected instructions and references. Unselected reference text is absent.
- The model sees the complete current message IDs and text. No assistant-specific specialist directory or creation protocol replaces the explicit Skill.
- Case 4 also supplies authorized source excerpts with source/version/SHA provenance. The saved reply and read receipt come from the actual worker call. The synthetic reply states incomplete coverage and no saved files; that reply is a transport fixture, not proof that a live model follows these instructions.
- Cases 1–4 save a normal conversational result; no new Agent, delegation receipt or extra model call.
- Case 5 produces no model call, attempt or successful output after withdrawal. Another account cannot read either the private source or Skill text.
- Case 6 is cancelled as INPUT_CHANGED before any model attempt, cannot be retried with the mixed route, and requires a fresh explicit Skill message. A fresh valid Skill call works.
- Existing ordinary assistant creation/delegation without a selected Skill, revision/grant fences, reference selection and limitations acknowledgment remain covered by their separate integration cases.

## Limits

This checks the current local text executor. It does not connect web retrieval, scripts, image generation or artifact_save, complete a PRISMA review, validate scientific conclusions, or certify the installed desktop binary/production deployment.
