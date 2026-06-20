# Follow Button Click Trace

When a user clicks the follow button, here's everything that happens from click to dashboard load.

## Phase 1: Click Event → Optimistic Update (Instant)

**File: [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx)**

```
User clicks the Follow/Unfollow button
  → CreatorCardInner.handleFollow() fires
  → followMutation.mutate(creator.id) is called
  → Button shows "Following..." / "Unfollowing..." immediately
```

**File: [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)**

```
useMutation's onMutate hook runs BEFORE network request:

1. Cancels any in-flight ['creators'] queries
2. Reads current cache: queryClient.getQueryData<Creator[]>(['creators'])
3. Optimistically updates the cached creator list:
   - Finds creator by ID
   - Flips isFollowing boolean
   - Adjusts followers count (±1)
   - Saves old state as 'previousCreators' for rollback
4. Updates UI immediately via queryClient.setQueryData()
```

**File: [src/lib/queryClient.ts](src/lib/queryClient.ts)**

```
QueryClient configuration activates:
  staleTime: 30 seconds   (cache age before marked stale)
  gcTime: 5 minutes       (cache retained before garbage collected)
  retry: 1                (retry failed requests once)
```

## Phase 2: Network Request (Async)

**File: [src/lib/api.ts](src/lib/api.ts)**

```
followCreator(id) → async fetch() call:
  POST /api/follow/:id
```

Browser Network → Server

## Phase 3: Server Processing

**File: [src/app/api/follow/[id]/route.ts](src/app/api/follow/[id]/route.ts)**

```
POST handler receives request:

1. Extracts { id } from dynamic route parameter
2. Simulates 1 second delay (await new Promise...)
3. Randomly returns 500 error (20% chance) to test error handling
4. Otherwise:
   - Reads current state from store
   - Gets currentIsFollowing and currentFollowers
   - Toggles isFollowing and adjusts followers ±1
   - Saves new state via setCreatorState()
5. Returns JSON response: { isFollowing, followers }
```

**File: [src/lib/store.ts](src/lib/store.ts)**

```
setCreatorState(id, { isFollowing, followers }) runs:
  - Stores state in in-memory Record: store[id] = newState
  - Persists for the lifetime of the server process
```

## Phase 4A: Success Path → Cache Invalidation

**File: [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts) — `onSettled` hook**

```
After server responds (success or error):

1. Invalidates ['creators'] query key
2. Marks cache as stale immediately
```

**File: [src/hooks/useCreators.ts](src/hooks/useCreators.ts)**

```
useQuery watches for invalidation signal:
  - TanStack Query refetches GET /api/creators
  - QueryClient calls fetchCreators() again
```

**File: [src/lib/api.ts](src/lib/api.ts)**

```
fetchCreators() → async fetch():
  GET /api/creators
```

**File: [src/app/api/creators/route.ts](src/app/api/creators/route.ts)**

```
GET handler reads fresh state:

1. Simulates 1 second delay
2. Maps base creator data + state from store:
   - Calls getCreatorState(id) for each creator
   - Includes isFollowing and followers from store
3. Returns fresh Creator[] array
```

**File: [src/lib/store.ts](src/lib/store.ts)**

```
getCreatorState(id) retrieves:
  - Current { isFollowing, followers } from in-memory store[id]
  - Returns undefined if not yet set (uses defaults)
```

## Phase 4B: Error Path (20% chance) → Rollback

**File: [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts) — `onError` hook**

```
If server returns 500:

1. Restores previousCreators from onMutate context
2. Reverts optimistic UI changes back to old state
3. Then onSettled still fires (same as success path)
```

## Phase 5: UI Update

**File: [src/components/Feed.tsx](src/components/Feed.tsx)**

```
useCreators() hook returns fresh data:
  - { data: creators, isLoading, isFetching }
  - Grid re-renders with updated creator list
```

**File: [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx)**

```
Creator card memo re-renders:
  - Button text changes from "Following..." → "Following" / "Follow"
  - creator.followers count updates
  - creator.isFollowing reflects new state
```

## Files Involved (In Order of Execution)

| File                             | Role                                 | Timing                             |
| -------------------------------- | ------------------------------------ | ---------------------------------- |
| src/components/CreatorCard.tsx   | Click handler, button UI             | Immediate                          |
| src/hooks/useFollowCreator.ts    | Mutation setup, optimistic update    | Immediate + onSettled              |
| src/lib/queryClient.ts           | Cache config                         | Immediate (used by mutation)       |
| src/lib/api.ts                   | Fetch wrapper                        | Network request                    |
| src/app/api/follow/[id]/route.ts | Server endpoint                      | Network response (1s delay)        |
| src/lib/store.ts                 | State persistence                    | Server-side, during follow request |
| src/hooks/useCreators.ts         | Query hook watching for invalidation | After onSettled                    |
| src/app/api/creators/route.ts    | Refetch endpoint                     | After invalidation                 |
| src/components/Feed.tsx          | Grid container                       | Re-renders on new data             |

## Timeline

```
T0ms:    Click → handleFollow() calls mutate()
T0ms:    onMutate runs → optimistic update applied, UI changes immediately
T0ms:    Button shows "Following..." / "Unfollowing..."

T0-50ms: fetch() network request fires
T50ms:   Server receives POST /api/follow/:id
T1050ms: Server returns (after 1s delay)
T1050ms: onSettled runs → invalidates ['creators']
T1050ms: TanStack Query refetches GET /api/creators
T1050ms: fetch() network request fires
T1050ms: Server receives GET /api/creators
T2050ms: Server returns fresh creator list
T2050ms: Feed re-renders with final state
```
