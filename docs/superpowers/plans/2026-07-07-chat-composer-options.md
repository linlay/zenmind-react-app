# Chat Composer Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline composer attachments and mobile query option chips for access level and model selection.

**Architecture:** Keep UI state in the chat detail controller, keep protocol normalization in core API services, and keep per-agent model option caching inside `chatSyncService`. The screen does not call SQLite, MMKV, WebSocket, or raw fetch directly.

**Tech Stack:** Expo SDK 56, React Native 0.85, TypeScript 6, NativeWind className constants, node:test scripts.

## Global Constraints

- Read `AGENTS.md` before code edits.
- Start from `xgraph context "<task>" --budget small` and relevant module cards.
- Do not add dependencies or modify lock files.
- Pages must not import SQLite, MMKV, `chatWsTransport`, or `wsClient` directly.
- Static UI styles should use NativeWind/Tailwind `className` constants; dynamic styles only for animation or runtime values.

---

### Task 1: Model Options Normalization And Query Payload

**Files:**
- Create: `src/core/api/services/modelOptionsApi.ts`
- Modify: `src/features/chatRealtime/chatWsTransport.ts`
- Test: `scripts/tests/chatModelOptions.test.mts`
- Test: `scripts/tests/chatWsTransportPayload.test.mts`

**Interfaces:**
- Produces: `normalizeModelOptionsResponse(response: unknown): ModelOptionsSnapshot`
- Produces: `buildModelOptionsPayload(agentKey: string): { agentKey?: string }`
- Produces: `ChatQueryPayloadInput.accessLevel?: ChatQueryAccessLevel`
- Produces: `ChatQueryPayloadInput.model?: ChatQueryModelOverride`

- [ ] Write failing tests for model option response normalization and query payload access/model fields.
- [ ] Run focused tests and confirm they fail because new exports/fields are missing.
- [ ] Implement the minimal API helper and query payload support.
- [ ] Re-run focused tests and confirm they pass.

### Task 2: Agent-Scoped Runtime Cache

**Files:**
- Modify: `src/features/chatRealtime/chatSyncService.ts`
- Test: `scripts/tests/chatModelOptions.test.mts`

**Interfaces:**
- Produces: `chatSyncService.getAgentModelOptionsSnapshot(agentKey: string): ModelOptionsSnapshot | null`
- Produces: `chatSyncService.ensureAgentModelOptions(agentKey: string): Promise<ModelOptionsSnapshot | null>`

- [ ] Add tests that require per-agent cache and in-flight dedupe by source inspection.
- [ ] Run the tests and confirm they fail.
- [ ] Add `agentModelOptions` and `agentModelOptionRequests` maps beside the existing agent detail cache.
- [ ] Clear model option caches when lifecycle/profile caches reset.
- [ ] Re-run focused tests.

### Task 3: Composer Option Row

**Files:**
- Create: `src/features/chatPersistence/components/ChatComposerOptionRow.tsx`
- Modify: `src/features/chatPersistence/components/ChatDetailComposerCard.tsx`
- Modify: `src/features/chatPersistence/ChatDetailScreen.tsx`
- Modify: `src/features/chatPersistence/useChatDetailConversationController.ts`
- Modify: `src/shared/icons/registries/appIconUsages.ts`
- Modify: `src/shared/i18n/messages/zh-CN.ts`
- Modify: `src/shared/i18n/messages/en-US.ts`

**Interfaces:**
- Consumes: `ModelOptionsSnapshot`
- Produces: local `accessLevel` and `modelOverride` state returned by `useChatDetailConversationController`

- [ ] Add the option row component with memoized chips and simple popover menus.
- [ ] Load model options only when an agent key exists and reuse cached snapshots.
- [ ] Keep non-CODER or empty option states graceful: show access chip and a disabled/loading model chip only as needed.
- [ ] Pass selected access/model options into send and re-ask calls.

### Task 4: Inline Attachments

**Files:**
- Modify: `src/features/chatPersistence/components/Composer.tsx`
- Modify: `src/features/chatPersistence/components/ChatAttachmentStrip.tsx`

**Interfaces:**
- Consumes existing `attachments`, `onRemoveAttachment`, `onRetryAttachment`
- Produces inline composer attachment display inside the gray composer surface

- [ ] Move `ChatAttachmentStrip` into `Animated.View` composer surface.
- [ ] Include attachment area height in the animated expanded container height.
- [ ] Tighten composer attachment strip padding and remove outside-shell behavior.
- [ ] Ensure toolbar and text input remain stable when attachments are added/removed.

### Task 5: Verification

**Files:**
- No new production files

- [ ] Run `node --test scripts/tests/chatModelOptions.test.mts scripts/tests/chatWsTransportPayload.test.mts`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm test`.
- [ ] Run `xgraph status`.
