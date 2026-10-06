# Personal Agent first batch (0.18 / chat1.7)

All routes use normal cookie session, Origin, CSRF and keyed mutation envelopes. All response objects are wrapped in `{data:...}`; lists add `nextCursor`. Exact exports live in `src/personal-assistant.ts`.

- `personalMemorySettings` GET `/me/memory-settings`; POST `updatePersonalMemorySettings` with `{expectedVersion,candidateLearning,timeZone,quietHours}`. Candidate learning defaults false; timezone defaults visible `Asia/Shanghai`. Quiet hours null or `{start:"22:00",end:"08:00"}`.
- `personalMemories` GET `/me/memories?status=all|confirmed|candidate|revoked&limit&cursor`; `personalMemory` GET `/me/memories/{id}`. Memory has `id,topic,content,scope:"general"|"topic",status,origin:"explicit"|"feedback"|"inferred",sourceMessageId,version,createdAt,updatedAt,allowedActions`.
- `createPersonalMemory` POST `/me/memories` with `{topic,content,scope}`. Corrects existing confirmed topic instead of duplicating it. `updatePersonalMemory` POST `/me/memories/{id}` adds expectedVersion. `decidePersonalMemory` POST `/me/memories/{id}/decision` with `{expectedVersion,decision:"confirm"|"revoke"}`. Candidate records are not model context until confirmed; corrections/revocations are versioned and auditable.
- `personalFollowups` GET `/me/followups?status=all|active|paused|completed|cancelled&limit&cursor`; `personalFollowup` GET `/me/followups/{id}`. `createPersonalFollowup` POST `/me/followups` with `{title,body,dueAt,timeZone,task:null|{id,version},quietHours:null|{start,end}}`. `updatePersonalFollowup` POST `/me/followups/{id}` adds expectedVersion. `changePersonalFollowup` POST `/me/followups/{id}/state` with `{expectedVersion,action:"pause"|"resume"|"complete"|"cancel"}`.
- Followup projection includes canonical `messageId` and actual `delivery:"scheduled"|"due"|"recorded"|"im_sent"|"im_uncertain"|"im_denied"`. A recorded service message is not proof of IM delivery or phone push. One-time reminders never repeat after their canonical message is written. Due worker is persistent, transactional and needs no LLM. Optional task requires current full task ACL; completed/cancelled tasks stop followup.

AgentTurn optional new metadata (absent on ordinary old replies):

```
memoryReceipt: {operation:saved|corrected|forgotten|candidate|clarify,
 memoryId:null|string,topic:null|string,status:null|confirmed|candidate|revoked,
 version:number,question:null|string}
followupReceipt: {operation:created|clarify,followupId:null|string,
 dueAt:null|instant,timeZone:null|string,question:null|string}
assistantReceipt:
 {kind:delegate,contactId,conversationId,displayName,reused,messageId,turnId,
  status:queued|unavailable,budget:{maxTokens,maxSeconds}}
 | {kind:collaborate,planId,actionIds}
```

Receipts describe saved objects, not SDK connection or completed work. Delegation is only to own available local specialists; current user request is copied to the canonical owned direct and a real child turn is queued with remaining parent budget. No external contact/key is selected; requester current text grants this scope, not quoted documents/history/profile/model instructions. Existing explicit creation flow is retained. Complex proposals use existing plan/action confirmation; people still accept independently.

Natural explicit preference heads include `记住...`, `以后回答/回复请...`, `纠正偏好...`, `忘记...`; one-time `这次...` is not permanent. Ambiguous correction/forget target clarifies. Current own local private chat may manage own user memory; files never grant this operation. Natural reminders require a complete future timestamp/timezone; ambiguous date/time asks for clarification instead of silently scheduling. All deterministic management works without a configured model.

Confirmed personal memories are separate from old Agent/private_agent memories. Only own local personal/direct chats receive relevant general/topic records; group, another person's Agent and external wire receive none. Context records carry source/scope and are version-fenced; no implicit summarization or truncation of authorized current fields. Candidate learning creates reviewable inferred candidates only when enabled. Model/result cannot independently save a preference.

Migration018 adds tables/indexes only. New turn metadata lives in private request_json and authorized projections; persisted strict message/turn documents keep old shapes. Old code cannot simply start on schema18; recovery must preserve the current database and fence pending Personal Assistant operations before a compatible old behavior image starts.
