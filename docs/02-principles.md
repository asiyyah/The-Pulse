# Caching Principles Mapped to Code

This document maps every file and pattern in The Pulse to fundamental caching principles. It shows how caching theory is applied in practice.

---

## 1. Cache Configuration & Lifecycle

**Caching Principle:** Define cache behavior settings globally to control when data is considered fresh vs stale vs garbage-collected.

### Files Involved

- [src/lib/queryClient.ts](src/lib/queryClient.ts)
- [src/app/providers.tsx](src/app/providers.tsx)

### Code

**[src/lib/queryClient.ts](src/lib/queryClient.ts) — Define Cache Timing**

```typescript
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000, // ← PRINCIPLE: Stale-While-Revalidate
        gcTime: 5 * 60 * 1000, // ← PRINCIPLE: Cache Retention
        refetchOnMount: true, // ← PRINCIPLE: Revalidation Trigger
        refetchOnWindowFocus: true, // ← PRINCIPLE: Background Refresh
        retry: 1, // ← PRINCIPLE: Resilience
      },
    },
  });
}
```

| Setting                      | Principle                  | What It Does                                                           |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `staleTime: 30_000`          | **Stale-While-Revalidate** | Data is fresh for 30 seconds. Don't ask server during this window.     |
| `gcTime: 5 * 60 * 1000`      | **Cache Eviction**         | Keep data in memory for 5 minutes even if stale. After 5 min, discard. |
| `refetchOnMount: true`       | **Revalidation on Entry**  | When component mounts, check if data is stale and refetch if needed.   |
| `refetchOnWindowFocus: true` | **Revalidation on Focus**  | When user returns to tab, revalidate stale data.                       |
| `retry: 1`                   | **Resilience**             | Retry failed requests once to handle transient failures.               |

**[src/app/providers.tsx](src/app/providers.tsx) — Instantiate Cache**

```typescript
'use client'
import { QueryClientProvider } from '@tanstack/react-query'
import { makeQueryClient } from '@/lib/queryClient'

export default function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient)  // ← PRINCIPLE: Cache Singleton
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

**Principle:** `useState(makeQueryClient)` creates **one cache instance per app lifecycle**, shared across all components. This ensures all components read from the same cache.

---

## 2. Query Key Management

**Caching Principle:** Use immutable, hierarchical query keys to uniquely identify cached data and manage cache coherency.

### Files Involved

- [src/hooks/useCreators.ts](src/hooks/useCreators.ts)

### Code

**[src/hooks/useCreators.ts](src/hooks/useCreators.ts) — Define Query Keys**

```typescript
export const CREATORS_KEY = ["creators"] as const;
//           ↓ PRINCIPLE: Immutable Key
//           ↓ PRINCIPLE: Hierarchical Structure
//           ↓ PRINCIPLE: Single Source of Truth for Key

export function useCreators() {
  return useQuery<Creator[]>({
    queryKey: CREATORS_KEY, // ← Reuse key across app
    queryFn: fetchCreators,
  });
}

export function useCreatorDetail(id: string) {
  return useQuery<CreatorDetail>({
    queryKey: ["creator", id], // ← PRINCIPLE: Hierarchical Key
    //         ↓ Scope
    //         ↓ Detail ID
    queryFn: () => fetchCreator(id),
  });
}

export function usePrefetchCreator() {
  const queryClient = useQueryClient();
  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ["creator", id], // ← Same key structure
      queryFn: () => fetchCreator(id),
    });
  };
}
```

| Key               | Scope             | Purpose                             |
| ----------------- | ----------------- | ----------------------------------- |
| `['creators']`    | All creators list | Query all data at once              |
| `['creator', id]` | Single creator    | Query detail for prefetch/later use |

**Principle:** Keys are organized hierarchically so related data (e.g., all creators vs individual creators) can be:

- **Found quickly** by key matching
- **Invalidated together** using prefix matching
- **Scoped appropriately** for refetching

---

## 3. Query Execution & Cache Population

**Caching Principle:** Fetch data only when cache is empty or stale, then populate cache with normalized responses.

### Files Involved

- [src/lib/api.ts](src/lib/api.ts)
- [src/hooks/useCreators.ts](src/hooks/useCreators.ts)

### Code

**[src/lib/api.ts](src/lib/api.ts) — Typed Request Wrapper**

```typescript
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  // ↓ PRINCIPLE: Request Validation
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  // ↓ PRINCIPLE: Response Normalization
  return response.json() as Promise<T>;
}

export function fetchCreators(): Promise<Creator[]> {
  return request<Creator[]>(`${BASE_URL}/creators`);
  // ↓ PRINCIPLE: Typed Response
  // ↓ PRINCIPLE: Single Entry Point
}
```

**Principle:** The request wrapper ensures:

- **Consistent error handling** (fail fast on non-2xx responses)
- **Type-safe responses** (generic `<T>` ensures correct typing)
- **Centralized fetch logic** (all requests go through `request()`)

When `useQuery` calls `fetchCreators`, TanStack Query:

1. Checks if `['creators']` exists in cache
2. If not, or if stale, calls `fetchCreators()`
3. Populates cache with returned `Creator[]`
4. Marks cache with timestamp for freshness tracking

---

## 4. Prefetching: Proactive Cache Warming

**Caching Principle:** Fetch data before it's needed to reduce perceived latency.

### Files Involved

- [src/hooks/useCreators.ts](src/hooks/useCreators.ts)
- [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx)

### Code

**[src/hooks/useCreators.ts](src/hooks/useCreators.ts) — Prefetch Hook**

```typescript
export function usePrefetchCreator() {
  const queryClient = useQueryClient();

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ["creator", id], // ← Same key as useCreatorDetail
      queryFn: () => fetchCreator(id),
      staleTime: 30_000, // ← PRINCIPLE: Prefetch Cache Timing
    });
    // ↑ PRINCIPLE: No subscription — prefetch doesn't trigger re-renders
    // ↑ PRINCIPLE: Cache warming — data ready before user clicks
  };
}
```

**[src/components/CreatorCard.tsx](src/components/CreatorCard.tsx) — Trigger Prefetch on Hover**

```typescript
const prefetchCreator = usePrefetchCreator()

const handleMouseEnter = useCallback(() => {
  prefetchCreator(creator.id)  // ← PRINCIPLE: Predictive Prefetch
  // ↑ On hover, warm the cache before user clicks
}, [prefetchCreator, creator.id])

return (
  <div onMouseEnter={handleMouseEnter}>
    {/* ... */}
  </div>
)
```

**Principle:** When user hovers over a creator card:

1. `handleMouseEnter` fires
2. `prefetchCreator` calls `queryClient.prefetchQuery`
3. `GET /api/creators/:id` executes in background
4. Response populates cache under `['creator', id]` key
5. If user clicks, data is already cached (instant!)

This follows **predictive prefetching:** humans hover before clicking, so prefetch during hover.

---

## 5. Cache Reading

**Caching Principle:** Read from cache directly for synchronous access without network overhead.

### Files Involved

- [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)

### Code

**[src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts) — Read Cache Before Mutation**

```typescript
export function useFollowCreator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: followCreator,
    onMutate: async (creatorId: string) => {
      // ↓ PRINCIPLE: Synchronous Cache Read
      const previousCreators =
        queryClient.getQueryData<Creator[]>(CREATORS_KEY);
      //                      ↓ Get data from memory instantly
      //                      ↓ No network involved
      //                      ↓ Type-safe with generic <Creator[]>

      // ... mutation logic ...

      return { previousCreators }; // ← PRINCIPLE: Backup for Rollback
    },
  });
}
```

**Principle:**

- `getQueryData()` returns cached data **instantly** from memory
- No network request
- Used to create a **snapshot for rollback** if mutation fails
- Returns `undefined` if cache doesn't have the key

---

## 6. Optimistic Updates: Cache Write Before Network

**Caching Principle:** Update cache immediately before server confirmation to provide instant feedback.

### Files Involved

- [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)
- [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx)

### Code

**[src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts) — Optimistic Update in onMutate**

```typescript
export function useFollowCreator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: followCreator,
    onMutate: async (creatorId: string) => {
      // ↓ PRINCIPLE: Cancel Pending Queries
      await queryClient.cancelQueries({ queryKey: CREATORS_KEY });
      // Prevents race condition: don't refetch while mutation in-flight

      // ↓ PRINCIPLE: Snapshot for Rollback
      const previousCreators =
        queryClient.getQueryData<Creator[]>(CREATORS_KEY);

      // ↓ PRINCIPLE: Optimistic Update
      queryClient.setQueryData<Creator[]>(CREATORS_KEY, (old) => {
        if (!old) return old;
        return old.map((creator) => {
          if (creator.id === creatorId) {
            return {
              ...creator,
              isFollowing: !creator.isFollowing, // ← Toggle immediately
              followers: creator.isFollowing
                ? creator.followers - 1 // ← Decrement if was following
                : creator.followers + 1, // ← Increment if wasn't following
            };
          }
          return creator;
        });
      });
      // ↑ All components subscribed to ['creators'] re-render NOW
      // ↑ UI shows "Following" before network responds

      return { previousCreators };
    },
  });
}
```

**Principle:**

1. **Cancel in-flight queries** to prevent stale data from overwriting optimistic update
2. **Save old state** for rollback if server rejects
3. **Update cache immediately** via `setQueryData()`
4. **All components watching this key re-render** instantly

---

## 7. Mutation Feedback: State-Driven UI

**Caching Principle:** Use mutation state to drive UI feedback (loading, disabled, text changes).

### Files Involved

- [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx)

### Code

**[src/components/CreatorCard.tsx](src/components/CreatorCard.tsx) — Render Based on Mutation State**

```typescript
function CreatorCardInner({ creator }: CreatorCardProps) {
  const followMutation = useFollowCreator()

  // ↓ PRINCIPLE: Derive Mutation State
  const isMutating = followMutation.isPending && followMutation.variables === creator.id
  // ↑ Is this specific creator's follow mutation pending?

  return (
    <>
      <button
        onClick={handleFollow}
        disabled={isMutating}  // ← PRINCIPLE: Disable During Mutation
        // ↑ Prevents double-clicks

        className={`${
          creator.isFollowing
            ? 'border border-zinc-300 ...'  // ← "Following" style
            : 'bg-zinc-900 ...'              // ← "Follow" style
        }`}
      >
        {isMutating
          ? creator.isFollowing
            ? 'Unfollowing...'    // ← PRINCIPLE: Show Action in Progress
            : 'Following...'
          : creator.isFollowing
            ? 'Following'          // ← PRINCIPLE: Show Current State
            : 'Follow'}
      </button>
    </>
  )
}

export const CreatorCard = memo(CreatorCardInner)
// ↑ PRINCIPLE: Memoization
// ↑ Only re-render if creator prop changes or mutation state changes
```

**Principle:**

- `isPending` flag from mutation tells us if request is in-flight
- Button disabled while `isMutating` to prevent double-submissions
- Button text reflects current state ("Following") AND action state ("Unfollowing...")
- `memo()` prevents unnecessary re-renders from parent

---

## 8. Error Handling & Rollback

**Caching Principle:** On error, restore cache to previous state to maintain consistency.

### Files Involved

- [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)

### Code

**[src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts) — Rollback on Error**

```typescript
export function useFollowCreator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: followCreator,
    onMutate: async (creatorId: string) => {
      // Save backup
      const previousCreators =
        queryClient.getQueryData<Creator[]>(CREATORS_KEY);

      // Update cache optimistically
      queryClient.setQueryData<Creator[]>(CREATORS_KEY, (old) => {
        // ... optimistic update ...
      });

      return { previousCreators }; // ← Pass backup to error handler
    },
    onError: (_error, _creatorId, context) => {
      // ↓ PRINCIPLE: Cache Restoration on Error
      if (context?.previousCreators) {
        queryClient.setQueryData<Creator[]>(
          CREATORS_KEY,
          context.previousCreators,
        );
        // ↑ Restore old state from backup
        // ↑ All components re-render with correct state
        // ↑ UI appears as if mutation never happened
      }
      // PRINCIPLE: User sees button return to "Follow"
      // PRINCIPLE: User sees followers count revert
      // PRINCIPLE: No stale state!
    },
  });
}
```

**Timeline with Error:**

```
T0ms:    User clicks Follow
T0ms:    onMutate: Save [sarah: 100], Set cache to [sarah: 101]
T0ms:    UI shows "Following", followers: 101
T0ms:    Network request fires
T1000ms: Server responds with ERROR 500
T1000ms: onError: Restore cache to [sarah: 100]
T1000ms: UI re-renders: shows "Follow", followers: 100
         User sees it was reverted, no confusion
```

---

## 9. Cache Invalidation: Marking Data as Stale

**Caching Principle:** After mutation, mark cache as stale to force refetch and ensure server truth.

### Files Involved

- [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)
- [src/components/RefreshButton.tsx](src/components/RefreshButton.tsx)

### Code

**[src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts) — Invalidate on Settle**

```typescript
export function useFollowCreator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: followCreator,
    onSettled: () => {
      // ↓ PRINCIPLE: Cache Invalidation
      queryClient.invalidateQueries({ queryKey: CREATORS_KEY });
      // ↑ Mark ['creators'] as STALE
      // ↑ Runs after mutation succeeds OR fails
      // ↑ Triggers refetch to get fresh server data
    },
  });
}
```

**[src/components/RefreshButton.tsx](src/components/RefreshButton.tsx) — Manual Refresh**

```typescript
export function RefreshButton({ isRefreshing }: RefreshButtonProps) {
  const queryClient = useQueryClient()

  const handleRefresh = () => {
    // ↓ PRINCIPLE: Explicit Cache Invalidation
    queryClient.invalidateQueries({ queryKey: CREATORS_KEY })
    // ↑ User manually requests fresh data
    // ↑ App refetches GET /api/creators
    // ↑ Cache updates with server truth
  }

  return (
    <button onClick={handleRefresh} disabled={isRefreshing}>
      {isRefreshing ? 'Refreshing...' : 'Refresh Feed'}
    </button>
  )
}
```

**Principle:**

- `invalidateQueries()` **does NOT delete** cache
- Instead, it marks cache as STALE (expired)
- Next time component reads the key, TanStack Query refetches
- Useful after mutations: optimistic update holds user, then background refetch gets truth

---

## 10. Server-Side Cache: In-Memory Store

**Caching Principle:** Cache mutable state on server to persist across API calls within process lifetime.

### Files Involved

- [src/lib/store.ts](src/lib/store.ts)
- [src/app/api/creators/route.ts](src/app/api/creators/route.ts)
- [src/app/api/follow/[id]/route.ts](src/app/api/follow/[id]/route.ts)

### Code

**[src/lib/store.ts](src/lib/store.ts) — Server-Side Cache Storage**

```typescript
export interface CreatorState {
  isFollowing: boolean;
  followers: number;
}

// ↓ PRINCIPLE: Module-Level In-Memory Cache
const store: Record<string, CreatorState> = {};

// ↓ PRINCIPLE: Cache Reads
export function getCreatorState(id: string): CreatorState | undefined {
  return store[id]; // ← Instant lookup, O(1)
}

// ↓ PRINCIPLE: Cache Writes
export function setCreatorState(id: string, state: CreatorState): void {
  store[id] = state; // ← Persist state for next API call
}
```

**[src/app/api/creators/route.ts](src/app/api/creators/route.ts) — Read Cache on GET**

```typescript
export async function GET() {
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate delay

  const creators: Creator[] = baseCreators.map((base) => {
    // ↓ PRINCIPLE: Check Server-Side Cache
    const stored = getCreatorState(base.id);
    // ↑ Read from in-memory store

    return {
      ...base,
      // ↓ PRINCIPLE: Use Cached Value if Available
      followers: stored?.followers ?? defaultFollowers[base.id],
      //          ↑ Use stored value
      //          ↑ Fall back to default if not in cache
      isFollowing: stored?.isFollowing ?? defaultFollowStates[base.id] ?? false,
    };
  });

  return Response.json(creators);
  // ↑ PRINCIPLE: Cache is reflected in API response
}
```

**[src/app/api/follow/[id]/route.ts](src/app/api/follow/[id]/route.ts) — Write Cache on POST**

```typescript
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (Math.random() < 0.2) {
    return Response.json({ error: "Network error" }, { status: 500 });
  }

  // ↓ PRINCIPLE: Read Current Cache State
  const current = getCreatorState(id);
  const currentIsFollowing = current?.isFollowing ?? false;
  const currentFollowers = current?.followers ?? defaultFollowers[id] ?? 0;

  // ↓ PRINCIPLE: Compute New State
  const newIsFollowing = !currentIsFollowing;
  const newFollowers = newIsFollowing
    ? currentFollowers + 1
    : currentFollowers - 1;

  // ↓ PRINCIPLE: Write New State to Cache
  setCreatorState(id, { isFollowing: newIsFollowing, followers: newFollowers });
  // ↑ Next GET request will read this updated cache

  return Response.json({
    isFollowing: newIsFollowing,
    followers: newFollowers,
  });
}
```

**Principle:**

- Module-level `store` acts as server-side cache
- Lives in memory, survives multiple API calls within same process
- Gets reset on server restart (not production-ready, but fine for demo)
- API routes read/write to this cache for state persistence

---

## 11. Skeleton Loading: Perceived Performance

**Caching Principle:** Show placeholder UI while cache is being populated to improve perceived speed.

### Files Involved

- [src/components/Feed.tsx](src/components/Feed.tsx)

### Code

**[src/components/Feed.tsx](src/components/Feed.tsx) — Skeleton While Loading**

```typescript
function SkeletonCard() {
  return (
    <div className="animate-pulse ...">
      <div className="mb-3 h-16 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
      {/* ↑ PRINCIPLE: Placeholder Shape */}
      {/* ↑ Looks like loading, not broken */}
    </div>
  )
}

export function Feed() {
  const { data: creators, isLoading, isFetching } = useCreators()

  return (
    <>
      {isLoading ? (
        // ↓ PRINCIPLE: Show Skeleton During Initial Load
        <div className="grid gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        // ↓ PRINCIPLE: Show Real Data When Cache Ready
        <div className="grid gap-4">
          {creators?.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          ))}
        </div>
      )}
    </>
  )
}
```

| State                          | Rendered             | UX                                     |
| ------------------------------ | -------------------- | -------------------------------------- |
| `isLoading`                    | Skeleton cards       | Shows something is loading, not broken |
| `isLoading` false, data exists | Real cards           | Data ready, show it                    |
| `isFetching` true              | Real cards (shimmer) | Background refresh happening           |

**Principle:** Skeleton fills the visual space while cache is being fetched, reducing perceived latency.

---

## 12. Stale-While-Revalidate Pattern

**Caching Principle:** Serve cached data immediately while fetching fresh data in background.

### Files Involved

- [src/lib/queryClient.ts](src/lib/queryClient.ts)
- [src/components/Feed.tsx](src/components/Feed.tsx)

### Code

**Timeline of Stale-While-Revalidate:**

```
Initial Load (T0-30s):
T0:    User visits app
T0:    Cache empty, Query fires GET /api/creators
T50ms: Data arrives, Cache populated, UI shows data
T30s:  Data becomes STALE

Subsequent Interactions (T30-35s):
T32s:  User refocuses tab
T32s:  Condition met: refetchOnWindowFocus=true
T32s:  Detect data is STALE
T32s:  Serve cached data immediately to component
T32s:  Component re-renders with cached data (instant!)
T32s:  Background: Query fires GET /api/creators again
T33s:  Fresh data arrives from server
T33s:  Cache updates with new data
T33s:  Components re-render with fresh data
       User might not notice any difference!
```

**Code Path:**

```typescript
// In queryClient.ts
{
  staleTime: 30_000,           // Fresh for 30s
  gcTime: 5 * 60 * 1000,       // Cache for 5 min
  refetchOnWindowFocus: true,  // Revalidate on focus
}

// In Feed.tsx
const { data: creators, isLoading, isFetching } = useCreators()
//      ↑ Serves stale data immediately
//                              ↑ Shows background refresh is happening

return (
  <>
    {isLoading && <Skeleton />}  // Only during initial fetch
    <Grid data={creators} />     // Stale data shown here
    {isFetching && <shimmer />}  // Shows refresh in progress
  </>
)
```

**Principle:**

- Serve stale cache immediately for instant UX
- Revalidate in background
- Optionally show `isFetching` indicator
- User sees data faster than waiting for fresh fetch

---

## Summary: Cache Lifecycle in The Pulse

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. CACHE CONFIGURATION                                          │
│    queryClient: staleTime=30s, gcTime=5m, refetchOnFocus=true  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 2. QUERY EXECUTION                                              │
│    useQuery(['creators'], fetchCreators)                        │
│    → Fetch if cache empty or stale                              │
│    → Populate cache with typed response                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 3. PREFETCHING (Optional)                                       │
│    onMouseEnter → usePrefetchCreator(id)                        │
│    → Warm cache before user clicks                              │
│    → Reduce perceived latency                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 4. USER ACTION (Follow/Unfollow)                                │
│    User clicks button                                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 5. OPTIMISTIC UPDATE (onMutate)                                 │
│    - Cancel in-flight queries                                   │
│    - Save old cache state (backup)                              │
│    - setQueryData: update cache immediately                     │
│    - Components re-render with optimistic data                  │
│    - Button shows "Following..." instantly                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│ 6. NETWORK REQUEST                                              │
│    POST /api/follow/:id                                         │
│    → Server reads cache (store.ts)                              │
│    → Updates server cache                                       │
│    → Responds with new state                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │             │
            ┌───────▼────────┐    │
            │ SUCCESS        │    │
            └───────┬────────┘    │
                    │      ┌──────▼──────────┐
                    │      │ ERROR (20%)     │
                    │      └───────┬─────────┘
                    │              │
        ┌───────────┴──────┐   ┌───▼────────────────────────┐
        │ 7A. SETTLE: OK   │   │ 7B. ROLLBACK (onError)     │
        │ (onSettled)      │   │ - Restore backup cache     │
        │ - Invalidate     │   │ - Revert UI to old state   │
        │   cache          │   │ - Button → "Follow"        │
        │                  │   └───┬────────────────────────┘
        │                  │       │
        │                  │   ┌───▼────────────────────────┐
        │                  │   │ 8. SETTLE: Error           │
        │                  │   │ (onSettled still fires)    │
        │                  │   │ - Invalidate cache         │
        │                  │   └───┬────────────────────────┘
        │                  │       │
        └──────────┬───────┴───────┘
                   │
        ┌──────────▼────────────────────────┐
        │ 9. REFETCH (Invalidation Trigger) │
        │    GET /api/creators              │
        │    → Server reads fresh cache     │
        │    → Returns all creators         │
        │    → Client cache updates         │
        │    → UI re-renders with truth     │
        └──────────┬─────────────────────────┘
                   │
        ┌──────────▼────────────────────────┐
        │ 10. FINAL STATE                   │
        │     Cache contains server truth   │
        │     staleTime resets (30s fresh)  │
        │     User sees correct state       │
        └────────────────────────────────────┘
```

---

## Caching Principles Applied

| Principle                  | Where Used                     | Code Reference                                    |
| -------------------------- | ------------------------------ | ------------------------------------------------- |
| **Cache Configuration**    | Global settings                | queryClient.ts                                    |
| **Query Key Hierarchy**    | Data identification            | useCreators.ts                                    |
| **Cache Population**       | Fetch & store                  | api.ts, useCreators.ts                            |
| **Prefetching**            | Predictive warming             | CreatorCard.tsx (hover)                           |
| **Stale-While-Revalidate** | Fast serve, background refresh | queryClient.ts (staleTime), Feed.tsx (isFetching) |
| **Optimistic Updates**     | Instant feedback               | useFollowCreator.ts (onMutate)                    |
| **Cache Reads**            | Get current state              | useFollowCreator.ts (getQueryData)                |
| **Cache Writes**           | Update state                   | useFollowCreator.ts (setQueryData)                |
| **Error Rollback**         | Consistency on failure         | useFollowCreator.ts (onError)                     |
| **Cache Invalidation**     | Force refetch                  | useFollowCreator.ts, RefreshButton.tsx            |
| **Server-Side Cache**      | Persist mutations              | store.ts, creators/route.ts, follow/route.ts      |
| **Skeleton Loading**       | Perceived performance          | Feed.tsx (SkeletonCard)                           |
| **Memoization**            | Reduce re-renders              | CreatorCard.tsx (memo)                            |
