# Phase 3: Fix Known Bugs

## Overview
- **Priority**: P1
- **Status**: pending
- **Description**: Fix bugs identified in code reviews

## Bugs to Fix

### 1. SSE stream ignores CancellationToken (C1 from review)
**File**: `directProviderClient.ts`
Pass CancellationToken to `_parseSSEStream`, register cancellation listener to reject Promise.

### 2. SSE Promise can resolve twice (H5 from review)
**File**: `directProviderClient.ts`
Add `resolved` flag guard — done signal + end event can both trigger resolve.

### 3. Double usage reporting (H6 from review)
**Files**: `directProviderClient.ts` + `agentChatBridge.ts`
Only report usage in one place — remove from DirectProviderClient (let bridge handle it).

### 4. Unsafe IHeaders cast (H3 from review)
**File**: `directProviderClient.ts`
Handle `string[]` header values properly.

## Success Criteria
- Cancelled requests reject promptly (no leaked Promises)
- No double-resolve of SSE stream Promise
- Usage reported exactly once per LLM call
