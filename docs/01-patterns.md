# Reusable Frontend Engineering Patterns

This document identifies and categorizes reusable frontend engineering patterns used in The Pulse project.

---

## 1. Data Fetching & Caching

### Query Hook Abstraction

**Files:** [src/hooks/useCreators.ts](src/hooks/useCreators.ts), [src/lib/api.ts](src/lib/api.ts)

Encapsulate data fetching logic in custom hooks that abstract TanStack Query details.

```typescript
// Pattern: Custom hook wraps useQuery
export function useCreators() {
  return useQuery<Creator[]>({
    queryKey: CREATORS_KEY,
    queryFn: fetchCreators,
  });
}
```

**Benefits:** Centralized data dependencies, easy to test, reusable across components.

---

### Stale-While-Revalidate Caching

**Files:** [src/lib/queryClient.ts](src/lib/queryClient.ts)

Set explicit cache timing to balance freshness and performance:

- `staleTime: 30_000` — Data considered fresh for 30 seconds
- `gcTime: 5 * 60 * 1000` — Cached data retained for 5 minutes

**Benefits:** Reduces network requests, improves perceived performance, allows background updates.

---

### Prefetching

**Files:** [src/hooks/useCreators.ts](src/hooks/useCreators.ts), [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx)

Warm cache proactively before data is needed:

```typescript
export function usePrefetchCreator() {
  const queryClient = useQueryClient();
  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ["creator", id],
      queryFn: () => fetchCreator(id),
      staleTime: 30_000,
    });
  };
}
```

Used on hover to prefetch detail data before user clicks.

**Benefits:** Faster perceived response, smoother UX.

---

### Cache Invalidation

**Files:** [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts), [src/components/RefreshButton.tsx](src/components/RefreshButton.tsx)

Explicitly mark cache as stale to trigger refetch:

```typescript
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: CREATORS_KEY });
};
```

**Benefits:** Ensures UI reflects server truth after mutations, explicit data refresh control.

---

## 2. State Management & Mutations

### Custom Mutation Hooks

**Files:** [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)

Encapsulate mutation logic including side effects and cache updates:

```typescript
export function useFollowCreator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: followCreator,
    onMutate: async (creatorId: string) => {
      /* ... */
    },
    onError: (_error, _creatorId, context) => {
      /* ... */
    },
    onSettled: () => {
      /* ... */
    },
  });
}
```

**Benefits:** Reusable mutation logic, consistent error handling, encapsulated side effects.

---

### Optimistic Updates

**Files:** [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)

Update UI immediately while request is in-flight, with rollback capability:

```typescript
onMutate: async (creatorId: string) => {
  // Cancel in-flight queries
  await queryClient.cancelQueries({ queryKey: CREATORS_KEY });

  // Save old state
  const previousCreators = queryClient.getQueryData<Creator[]>(CREATORS_KEY);

  // Update cache immediately
  queryClient.setQueryData<Creator[]>(CREATORS_KEY, (old) => {
    // Toggle follow state and adjust followers count
  });

  return { previousCreators };
};
```

**Benefits:** Instant feedback, better perceived performance, maintains server as source of truth.

---

### Error Recovery & Rollback

**Files:** [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)

Revert optimistic updates if mutation fails:

```typescript
onError: (_error, _creatorId, context) => {
  if (context?.previousCreators) {
    queryClient.setQueryData<Creator[]>(CREATORS_KEY, context.previousCreators);
  }
};
```

**Benefits:** User experience remains consistent even on errors, no stale state.

---

### Mutation Lifecycle Hooks

**Files:** [src/hooks/useFollowCreator.ts](src/hooks/useFollowCreator.ts)

Use `onMutate`, `onError`, and `onSettled` for a complete mutation workflow:

- **onMutate:** Optimistic update before network
- **onError:** Rollback and error handling
- **onSettled:** Cleanup and cache invalidation

**Benefits:** Predictable mutation flow, clean separation of concerns.

---

## 3. Component Patterns

### Server/Client Component Split

**Files:** [src/app/layout.tsx](src/app/layout.tsx), [src/app/page.tsx](src/app/page.tsx), [src/app/providers.tsx](src/app/providers.tsx)

Use server components for structure and setup, client components for interactivity:

```typescript
// Server component
export default function RootLayout({ children }) {
  return <html><body><Providers>{children}</Providers></body></html>
}

// Client component with context provider
'use client'
export default function Providers({ children }) {
  const [queryClient] = useState(makeQueryClient)
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

**Benefits:** Cleaner dependency injection, smaller client bundles, better performance.

---

### Memoization

**Files:** [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx)

Prevent unnecessary re-renders with `React.memo` and `useCallback`:

```typescript
function CreatorCardInner({ creator }: CreatorCardProps) {
  const handleFollow = useCallback(() => {
    // Prevent re-render from parent
  }, [followMutation, creator.id, isMutating]);
}

export const CreatorCard = memo(CreatorCardInner);
```

**Benefits:** Reduces re-renders in lists, improves performance with large datasets.

---

### Custom Hooks for Logic Reuse

**Files:** [src/hooks/](src/hooks/)

Extract complex logic into hooks for reuse and testability:

```typescript
const { data: creators, isLoading, isFetching } = useCreators();
const followMutation = useFollowCreator();
const prefetchCreator = usePrefetchCreator();
```

**Benefits:** DRY principle, easier to test, cleaner component code.

---

### Props Interface Typing

**Files:** [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx), [src/components/RefreshButton.tsx](src/components/RefreshButton.tsx)

Explicitly type component props for safety:

```typescript
interface CreatorCardProps {
  creator: Creator;
}

interface RefreshButtonProps {
  isRefreshing: boolean;
}
```

**Benefits:** Compile-time safety, self-documenting code, IDE support.

---

## 4. Performance Optimization

### Skeleton Loading States

**Files:** [src/components/Feed.tsx](src/components/Feed.tsx)

Show placeholder UI during data fetch:

```typescript
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border ...">
      <div className="mb-3 h-16 w-16 rounded-full bg-zinc-200" />
      {/* Placeholder shapes */}
    </div>
  )
}

{isLoading ? (
  <div className="grid gap-4">
    {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
  </div>
) : (
  // Actual content
)}
```

**Benefits:** Better perceived performance, reduced layout shift, smoother UX.

---

### State-Driven Button UI

**Files:** [src/components/CreatorCard.tsx](src/components/CreatorCard.tsx)

Show loading/disabled states during mutations:

```typescript
const isMutating = followMutation.isPending && followMutation.variables === creator.id

<button
  onClick={handleFollow}
  disabled={isMutating}
  className={...}
>
  {isMutating
    ? creator.isFollowing
      ? 'Unfollowing...'
      : 'Following...'
    : creator.isFollowing
      ? 'Following'
      : 'Follow'}
</button>
```

**Benefits:** Clear user feedback, prevents double-clicks, intuitive UX.

---

### Conditional Rendering Based on Query State

**Files:** [src/components/Feed.tsx](src/components/Feed.tsx)

Use `isLoading` and `isFetching` flags to manage UI states:

```typescript
const { data: creators, isLoading, isFetching } = useCreators()

return (
  <>
    <RefreshButton isRefreshing={isFetching} />
    {isLoading ? <Skeleton /> : <Content />}
  </>
)
```

**Benefits:** Explicit state handling, prevents race conditions.

---

## 5. Error Handling & Resilience

### Automatic Retry Logic

**Files:** [src/lib/queryClient.ts](src/lib/queryClient.ts)

Configure retry behavior for failed requests:

```typescript
defaultOptions: {
  queries: {
    retry: 1,  // Retry once on failure
  }
}
```

**Benefits:** Handles transient network failures, improves reliability.

---

### Server-Side Error Simulation

**Files:** [src/app/api/follow/[id]/route.ts](src/app/api/follow/[id]/route.ts)

Intentionally introduce errors to test error paths:

```typescript
if (Math.random() < 0.2) {
  // 20% failure rate
  return Response.json(
    { error: "Network error. Please try again." },
    { status: 500 },
  );
}
```

**Benefits:** Forces error handling code paths, validates rollback logic.

---

## 6. Type Safety & Developer Experience

### Typed Query Keys

**Files:** [src/hooks/useCreators.ts](src/hooks/useCreators.ts)

Use TypeScript `as const` for immutable, type-safe query keys:

```typescript
export const CREATORS_KEY = ["creators"] as const;

// Prevents typos, enables IDE autocomplete
queryClient.invalidateQueries({ queryKey: CREATORS_KEY });
```

**Benefits:** Compile-time safety, prevents cache inconsistencies.

---

### Typed API Responses

**Files:** [src/lib/types.ts](src/lib/types.ts), [src/lib/api.ts](src/lib/api.ts)

Define interfaces for all API contracts:

```typescript
export interface Creator {
  id: string;
  name: string;
  avatar: string;
  followers: number;
  recentPosts: number;
  isFollowing: boolean;
}

export interface CreatorDetail extends Creator {
  bio: string;
  joinedDate: string;
  totalPosts: number;
}
```

Used in generic fetch wrapper:

```typescript
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  return response.json() as Promise<T>;
}
```

**Benefits:** End-to-end type safety, documentation, IDE support.

---

### Generic Fetch Wrapper

**Files:** [src/lib/api.ts](src/lib/api.ts)

Abstract HTTP concerns in a reusable, typed wrapper:

```typescript
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<T>;
}

export function fetchCreators(): Promise<Creator[]> {
  return request<Creator[]>(`${BASE_URL}/creators`);
}
```

**Benefits:** DRY error handling, consistent API usage, easier testing.

---

## 7. API Design

### RESTful Route Structure

**Files:** [src/app/api/creators/route.ts](src/app/api/creators/route.ts), [src/app/api/follow/[id]/route.ts](src/app/api/follow/[id]/route.ts)

Organize routes by resource and action:

```
GET  /api/creators       → List all creators
GET  /api/creators/:id   → Get creator detail
POST /api/follow/:id     → Toggle follow
```

**Benefits:** Predictable, RESTful semantics, easy to extend.

---

### Dynamic Route Parameters

**Files:** [src/app/api/creators/[id]/route.ts](src/app/api/creators/[id]/route.ts), [src/app/api/follow/[id]/route.ts](src/app/api/follow/[id]/route.ts)

Use Next.js dynamic routes for parameterized endpoints:

```typescript
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Handle POST /api/follow/:id
}
```

**Benefits:** Clean URL structure, type-safe parameter extraction.

---

### Simulated Delays

**Files:** [src/app/api/creators/route.ts](src/app/api/creators/route.ts), [src/app/api/follow/[id]/route.ts](src/app/api/follow/[id]/route.ts)

Add artificial network latency to test UI behavior:

```typescript
await new Promise((resolve) => setTimeout(resolve, 1000));
```

**Benefits:** Ensures UI handles loading states correctly, tests race conditions.

---

## Summary

These patterns support:

- **Scalability:** Custom hooks and abstraction layers make it easy to add features
- **Maintainability:** Type safety and modular structure
- **Performance:** Caching, prefetching, memoization, optimistic updates
- **Reliability:** Error handling, retry logic, rollback mechanisms
- **Developer Experience:** TypeScript, custom hooks, clear conventions
