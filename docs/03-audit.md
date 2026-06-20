# Security & Vulnerability Audit

This document audits The Pulse codebase for security concerns and vulnerabilities across caching, data consistency, memory management, and user feedback.

---

## 1. Race Conditions: Double-Click Follow (High Severity)

### Vulnerability
When a user clicks the Follow button multiple times in rapid succession, multiple mutations can be queued. This can cause **lost updates** on the server.

### Affected Code

**Client-Side Protection (Partial):**
```typescript
// src/components/CreatorCard.tsx
const isMutating = followMutation.isPending && followMutation.variables === creator.id

const handleFollow = useCallback(() => {
  if (isMutating) return  // ← Prevents clicks while pending
  followMutation.mutate(creator.id)
}, [followMutation, creator.id, isMutating])

return (
  <button
    onClick={handleFollow}
    disabled={isMutating}  // ← Disables button during mutation
    // ...
  >
    {isMutating ? 'Following...' : 'Follow'}
  </button>
)
```

**Problem:** The button is disabled, but if there's a race condition in the React state update, or if the user has browser DevTools open and manipulates state, multiple mutations can still be dispatched.

**Server-Side Vulnerability (Critical):**
```typescript
// src/app/api/follow/[id]/route.ts
const current = getCreatorState(id)
const currentIsFollowing = current?.isFollowing ?? false
const currentFollowers = current?.followers ?? defaultFollowers[id] ?? 0

const newIsFollowing = !currentIsFollowing
const newFollowers = newIsFollowing ? currentFollowers + 1 : currentFollowers - 1

setCreatorState(id, { isFollowing: newIsFollowing, followers: newFollowers })
```

**Issue:** No transactional locking or atomic operations. If two POST requests arrive simultaneously:

```
Timeline of Lost Update:
T0ms:  Request A reads: followers=100, isFollowing=false
T0ms:  Request B reads: followers=100, isFollowing=false
T5ms:  Request A computes: followers=101, isFollowing=true
T5ms:  Request B computes: followers=101, isFollowing=true
T10ms: Request A writes: followers=101, isFollowing=true
T15ms: Request B writes: followers=101, isFollowing=true ← Same value!
       Expected: 102 and true/false toggle
       Actual: 101 and true (one increment lost)
```

### Impact
- Follower counts can become inconsistent
- User's follow state may not toggle as expected
- Data corruption in the in-memory store

### Recommendations
1. **Client-side:** Ensure button stays disabled during mutation
   ```typescript
   <button disabled={isMutating || isLoading} />
   ```

2. **Server-side:** Add request deduplication
   ```typescript
   const requestId = _request.headers.get('x-idempotency-key')
   if (seenRequests.has(requestId)) {
     return cachedResponse.get(requestId)
   }
   ```

3. **Server-side (Better):** Implement atomic transactions
   ```typescript
   // Use a database transaction or atomic operation
   return await db.transaction(async (trx) => {
     const current = await trx.creators.findOne(id)
     const newState = {...}
     await trx.creators.update(id, newState)
     return newState
   })
   ```

4. **API Design:** Use PATCH instead of POST for idempotency
   ```
   PATCH /api/creators/:id/follow
   Body: { isFollowing: true }
   // Always sets to desired state, not toggles
   ```

---

## 2. Stale User Data After Logout (Medium Severity)

### Vulnerability
There is **no logout mechanism**, and if implemented, the cache would persist the previous user's data.

### Affected Code

**No Logout Handler:**
```typescript
// src/app/layout.tsx - No logout or cache clearing
export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

// src/app/providers.tsx - Cache persists forever
const [queryClient] = useState(makeQueryClient)
return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
```

### Scenario
```
T0min:   User A logs in
T0min:   Loads creators feed → Cache populated with User A's follow state
T5min:   User A logs out (no cache clear)
T5min:   User B logs in on same browser
T5min:   Cache still contains User A's follow state!
T5min:   User B sees User A's follows until cache expires (5 minutes)
         → Information leakage!
```

### Impact
- Cross-user data leakage
- User B can see who User A follows
- Sensitive user preferences exposed
- Privacy violation

### Timeline of Exposure
```
T0min:  Cache populated (User A)
T5min:  staleTime expires, but cache stays in gcTime
T5min:  User B sees stale data
T10min: Cache fully evicted (gcTime expires)
        User B now sees fresh data
```

### Recommendations
1. **Clear cache on logout:**
   ```typescript
   async function handleLogout() {
     // Clear all cache
     queryClient.clear()
     // Or clear specific user data
     queryClient.invalidateQueries()
     // Redirect to login
     router.push('/login')
   }
   ```

2. **Implement per-user cache keys:**
   ```typescript
   const CREATORS_KEY = (userId: string) => ['creators', userId] as const
   // Now different users have separate cache entries
   ```

3. **Set cache expiry on logout:**
   ```typescript
   queryClient.getQueryCache().clear()
   queryClient.getMutationCache().clear()
   ```

4. **Consider session tokens:**
   ```typescript
   // Invalidate server-side session
   // Client clears cache
   // Prevent using old tokens to access data
   ```

---

## 3. Unbounded Cache Growth: Memory Leak Risk (Medium Severity)

### Vulnerability
Cache grows without upper bounds within the `gcTime` window. A user who prefetches many creators can accumulate significant memory.

### Affected Code

**Cache Configuration:**
```typescript
// src/lib/queryClient.ts
gcTime: 5 * 60 * 1000  // ← Keep in memory for 5 minutes
```

**Prefetch Hook (No Limits):**
```typescript
// src/hooks/useCreators.ts
export function usePrefetchCreator() {
  const queryClient = useQueryClient()
  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ['creator', id],  // ← One entry per creator prefetched
      queryFn: () => fetchCreator(id),
    })
  }
}

// src/components/CreatorCard.tsx
const handleMouseEnter = useCallback(() => {
  prefetchCreator(creator.id)  // ← Called on every hover
}, [prefetchCreator, creator.id])
```

### Scenario: Memory Growth
```
User browses creators and hovers over each:
T0s:    Hover Creator 1 → Prefetch ['creator', '1'] → 1KB
T2s:    Hover Creator 2 → Prefetch ['creator', '2'] → 1KB
T4s:    Hover Creator 3 → Prefetch ['creator', '3'] → 1KB
...
T60s:   Hover Creator 100 → Prefetch ['creator', '100'] → 1KB
        
Memory used: ~100KB in cache
Within 5 minutes: Could be MANY MB if combined with other queries
```

### Impact
- Slow browser on low-memory devices (phones, tablets)
- Increased memory footprint
- Potential browser crash with sustained usage
- Poor performance on slow networks (more data = slower)

### Current Limitations of `gcTime`
```typescript
gcTime: 5 * 60 * 1000  // Only governs timing, not size
```

The `gcTime` setting **does NOT limit cache size**. It only removes entries after 5 minutes of inactivity. If user constantly hovers, entries never get evicted!

### Memory Calculation
```
Per creator detail:
{
  id: "1",           // ← ~10 bytes
  name: "Aria Chen", // ← ~20 bytes
  avatar: "url",     // ← ~100 bytes
  followers: 45200,  // ← 8 bytes
  recentPosts: 38,   // ← 8 bytes
  bio: "...",        // ← ~500 bytes
  joinedDate: "...", // ← ~30 bytes
  totalPosts: 250    // ← 8 bytes
}                    // Total: ~684 bytes per entry

Cache overhead: ~10% additional per entry

100 creators × 684 bytes = 68.4 KB
1000 creators × 684 bytes = 684 KB
10000 creators × 684 bytes = 6.84 MB ← Could happen on a long session!
```

### Recommendations
1. **Implement cache size limits:**
   ```typescript
   export function makeQueryClient() {
     return new QueryClient({
       defaultOptions: {
         queries: {
           gcTime: 5 * 60 * 1000,
         },
       },
     })
   }
   
   // Add custom garbage collection
   const maxCacheSize = 50  // Max 50 cached entries
   queryClient.getQueryCache().getAll().length > maxCacheSize
     ? evictOldest()
     : null
   ```

2. **Limit prefetch aggressively:**
   ```typescript
   export function usePrefetchCreator() {
     const queryClient = useQueryClient()
     const prefetchedRef = useRef(new Set())
     
     return (id: string) => {
       if (prefetchedRef.current.size > 10) return  // ← Max 10 prefetched
       if (prefetchedRef.current.has(id)) return    // ← Skip if already prefetched
       
       prefetchedRef.current.add(id)
       queryClient.prefetchQuery({
         queryKey: ['creator', id],
         queryFn: () => fetchCreator(id),
       })
     }
   }
   ```

3. **Use shorter `gcTime` for detail queries:**
   ```typescript
   export function usePrefetchCreator() {
     return (id: string) => {
       queryClient.prefetchQuery({
         queryKey: ['creator', id],
         queryFn: () => fetchCreator(id),
         staleTime: 30_000,
         gcTime: 1 * 60 * 1000,  // ← Only 1 minute for prefetches
       })
     }
   }
   ```

4. **Debounce prefetch:**
   ```typescript
   const handleMouseEnter = useCallback(
     debounce((creatorId: string) => {
       prefetchCreator(creatorId)
     }, 200),  // ← Wait 200ms before prefetching
     [prefetchCreator]
   )
   ```

5. **Monitor cache size in development:**
   ```typescript
   if (process.env.NODE_ENV === 'development') {
     setInterval(() => {
       const size = queryClient.getQueryCache().getAll().length
       console.log(`Cache entries: ${size}`)
     }, 5000)
   }
   ```

---

## 4. Over-Fetching on Remount (Low Severity)

### Vulnerability
When components remount (navigate away and back), `refetchOnMount: true` triggers unnecessary refetches even if data is fresh.

### Affected Code

**Aggressive Refetch Settings:**
```typescript
// src/lib/queryClient.ts
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,           // Fresh for 30 seconds
        refetchOnMount: true,        // ← Refetch on EVERY mount
        refetchOnWindowFocus: true,  // ← Refetch on window focus
      },
    },
  })
}
```

### Scenario
```
T0s:    User navigates to /
T1s:    Feed component mounts
T1s:    GET /api/creators fires → 1KB downloaded
T10s:   Data cached, staleTime not expired
T10s:   User navigates to /creator/1
T15s:   User navigates back to /
T15s:   Feed component remounts
T15s:   refetchOnMount=true triggers
T15s:   Data staleTime=30_000 still fresh! But still refetches
T15s:   GET /api/creators fires again → 1KB downloaded (wasted!)
```

### Impact
- Unnecessary network requests
- Wasted bandwidth
- Battery drain on mobile
- Server load increase
- Slower perceived performance

### Calculation
```
Over 1 hour session with 10 navigations:
With refetchOnMount=true:
  10 remounts × 1KB = 10KB (might be more with larger datasets)

With a real product (1MB feed):
  10 remounts × 1MB = 10MB wasted data!
  
On a metered connection (prepaid data):
  User pays for unnecessary data transfer
```

### Recommendations
1. **Refine `refetchOnMount` strategy:**
   ```typescript
   staleTime: 30_000,
   refetchOnMount: 'stale',  // ← Only refetch if STALE
   // Default is 'stale', so this is already good!
   // But verify it's set correctly
   ```

2. **Increase `staleTime` for less-changing data:**
   ```typescript
   export const CREATORS_KEY = ['creators'] as const
   
   export function useCreators() {
     return useQuery<Creator[]>({
       queryKey: CREATORS_KEY,
       queryFn: fetchCreators,
       staleTime: 2 * 60 * 1000,  // ← 2 minutes instead of 30s
     })
   }
   ```

3. **Disable `refetchOnWindowFocus` for large datasets:**
   ```typescript
   defaultOptions: {
     queries: {
       staleTime: 30_000,
       refetchOnWindowFocus: false,  // ← Only manually refresh
     },
   }
   ```

4. **Add explicit staleTime per query:**
   ```typescript
   // List queries: longer cache
   useQuery({
     queryKey: CREATORS_KEY,
     queryFn: fetchCreators,
     staleTime: 5 * 60 * 1000,  // 5 minutes
   })
   
   // Detail queries: shorter cache
   useQuery({
     queryKey: ['creator', id],
     queryFn: () => fetchCreator(id),
     staleTime: 1 * 60 * 1000,  // 1 minute
   })
   ```

---

## 5. No Error Feedback on Network Failure (Medium Severity)

### Vulnerability
When a mutation fails, the user sees the button revert to its previous state, but gets **no error message** explaining why.

### Affected Code

**Rollback Without Notification:**
```typescript
// src/hooks/useFollowCreator.ts
onError: (_error, _creatorId, context) => {
  if (context?.previousCreators) {
    queryClient.setQueryData<Creator[]>(CREATORS_KEY, context.previousCreators)
    // ↑ Silently restores old state
    // ↓ No error message shown!
  }
},
```

**Button Resets Without Explanation:**
```typescript
// src/components/CreatorCard.tsx
{isMutating
  ? creator.isFollowing
    ? 'Unfollowing...'
    : 'Following...'
  : creator.isFollowing
    ? 'Following'
    : 'Follow'}  // ← Just shows button text, no error indication
```

### Scenario
```
T0s:    User clicks Follow on "Sarah"
T0s:    Button shows "Following..."
T0s:    Optimistic update: Sarah's followers goes 100→101
T1s:    Network fails (server returns 500)
T1s:    onError runs: Restores followers to 100
T1s:    Button shows "Follow" again
        
User perspective:
  "I clicked Follow... the button changed... now it changed back.
   Did it work? Is there a problem? What happened?"
  ← Complete confusion!
```

### Impact
- User doesn't know if action succeeded or failed
- No feedback on network problems
- User might click again (creating duplicate attempts)
- Poor user experience
- Looks like app is broken

### Recommendations
1. **Show error toast/notification:**
   ```typescript
   onError: (error, _creatorId, context) => {
     if (context?.previousCreators) {
       queryClient.setQueryData<Creator[]>(CREATORS_KEY, context.previousCreators)
     }
     
     // Show error to user
     toast.error(`Failed to ${isMutating ? 'un' : ''}follow. Please try again.`)
     // or
     showNotification({
       type: 'error',
       message: 'Failed to update follow status',
       duration: 3000
     })
   }
   ```

2. **Add error state to button:**
   ```typescript
   const hasError = followMutation.isError
   
   <button
     disabled={isMutating || hasError}
     className={`
       ${hasError ? 'border border-red-500 text-red-600' : ''}
     `}
   >
     {hasError
       ? 'Failed - Try again'
       : isMutating
         ? 'Following...'
         : 'Follow'}
   </button>
   ```

3. **Implement retry UI:**
   ```typescript
   const canRetry = followMutation.isError && !isMutating
   
   <button
     onClick={() => canRetry && followMutation.mutate(creator.id)}
     disabled={isMutating}
   >
     {followMutation.isError ? 'Retry' : 'Follow'}
   </button>
   ```

4. **Clear error state after retry:**
   ```typescript
   onMutate: async (creatorId: string) => {
     // Clear previous error
     followMutation.reset()
     // ... rest of mutation ...
   }
   ```

5. **Show retry counter:**
   ```typescript
   {followMutation.isError && (
     <p className="text-xs text-red-600 mt-2">
       Failed. {retryCount} retries attempted.
     </p>
   )}
   ```

---

## 6. Concurrent Mutations on Same Entity (Medium Severity)

### Vulnerability
Multiple mutations on the same creator can queue up, causing the optimistic updates to compound incorrectly.

### Scenario
```
Initial state: isFollowing=false, followers=100

T0s:    User clicks Follow
T0s:    onMutate: Set followers=101, isFollowing=true
T50ms:  Mutation A queued
T50ms:  User rapidly clicks again (button still loading from network lag)
T50ms:  Mutation B queued (if button wasn't properly disabled)
T100ms: Mutation A executes: POST /api/follow/creatorId
T150ms: Mutation B queued, waiting
T1100ms: Server responds to A: success
T1100ms: onSettled invalidates cache
T1100ms: Mutation B still in queue
T1150ms: Mutation B executes: POST /api/follow/creatorId
T2150ms: Server responds to B: success

Expected state: isFollowing=false, followers=100 (toggled twice)
Actual state: Could be corrupted!
```

### Impact
- State inconsistencies
- Followers count off by ±1 or more
- Race condition on server side (covered in #1)

### Recommendations
1. **Disable during mutation (already implemented but verify):**
   ```typescript
   disabled={isMutating || isLoading}
   ```

2. **Prevent rapid mutation requests:**
   ```typescript
   const [lastMutationTime, setLastMutationTime] = useState(0)
   const canMutate = Date.now() - lastMutationTime > 500  // Min 500ms between
   
   const handleFollow = () => {
     if (!canMutate || isMutating) return
     setLastMutationTime(Date.now())
     followMutation.mutate(creatorId)
   }
   ```

3. **Use mutation queue strategy:**
   ```typescript
   const mutationQueue = useRef<Promise<void>>(Promise.resolve())
   
   const handleFollow = async () => {
     mutationQueue.current = mutationQueue.current.then(async () => {
       await followMutation.mutateAsync(creatorId)
     })
   }
   ```

---

## 7. Server-Side Race Condition: Lost Updates (Critical)

### Vulnerability
The server has **no atomicity**. Two simultaneous requests can cause lost updates.

### Affected Code
```typescript
// src/app/api/follow/[id]/route.ts
const current = getCreatorState(id)
const currentIsFollowing = current?.isFollowing ?? false
const currentFollowers = current?.followers ?? defaultFollowers[id] ?? 0

const newIsFollowing = !currentIsFollowing
const newFollowers = newIsFollowing ? currentFollowers + 1 : currentFollowers - 1

setCreatorState(id, { isFollowing: newIsFollowing, followers: newFollowers })
```

### Attack Scenario
```
Initial: followers=100, isFollowing=false

Request A starts                Request B starts
Read state: 100, false         Wait...
                               Read state: 100, false
Compute: 101, true            
                               Compute: 101, true
Write: 101, true              
                               Write: 101, true ← LOST INCREMENT!

Final: followers=101 (should be 102!)
```

### Impact
- Follower counts become incorrect
- Cumulative data corruption
- Financial impact if followers affect revenue
- User distrust in the system

### Recommendations
1. **Use atomic operations with version checking:**
   ```typescript
   export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
     const { id } = await params
     const maxRetries = 3
     let retries = 0
     
     while (retries < maxRetries) {
       const current = getCreatorState(id)
       const version = current?.version ?? 0
       
       const newIsFollowing = !current?.isFollowing
       const newFollowers = newIsFollowing 
         ? (current?.followers ?? 0) + 1
         : (current?.followers ?? 0) - 1
       
       const success = compareAndSwap(id, version, {
         isFollowing: newIsFollowing,
         followers: newFollowers,
         version: version + 1
       })
       
       if (success) {
         return Response.json({ isFollowing: newIsFollowing, followers: newFollowers })
       }
       retries++
     }
     
     return Response.json({ error: 'Failed after retries' }, { status: 500 })
   }
   ```

2. **Use idempotent API design:**
   ```typescript
   // Instead of toggle, set explicit state
   PATCH /api/creators/:id/follow
   Body: { isFollowing: true }
   // Always sets to desired state, can be safely retried
   ```

3. **Implement database transactions (when using real DB):**
   ```typescript
   return await db.transaction(async (trx) => {
     const current = await trx('creators').where({ id }).first().forUpdate()
     await trx('creators').where({ id }).update({
       isFollowing: !current.isFollowing,
       followers: current.followers + (current.isFollowing ? -1 : 1)
     })
   })
   ```

---

## 8. No Input Validation (Low Severity)

### Vulnerability
Creator IDs are not validated before processing.

### Affected Code
```typescript
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params  // ← No validation!
  
  const current = getCreatorState(id)  // ← Could be invalid ID
}
```

### Scenario
```
POST /api/follow/../../../../../../etc/passwd
POST /api/follow/<script>alert('xss')</script>
POST /api/follow/999999999  // Non-existent ID
```

### Recommendations
1. **Validate creator IDs:**
   ```typescript
   const { id } = await params
   
   if (!id || typeof id !== 'string' || !/^\d+$/.test(id)) {
     return Response.json({ error: 'Invalid creator ID' }, { status: 400 })
   }
   
   const creatorExists = baseCreators.some(c => c.id === id)
   if (!creatorExists) {
     return Response.json({ error: 'Creator not found' }, { status: 404 })
   }
   ```

---

## 9. Missing Error Boundaries (Low Severity)

### Vulnerability
Component errors can crash the entire app with no fallback UI.

### Recommendations
1. **Add Error Boundary:**
   ```typescript
   export default function RootLayout({ children }: { children: ReactNode }) {
     return (
       <html>
         <body>
           <ErrorBoundary>
             <Providers>{children}</Providers>
           </ErrorBoundary>
         </body>
       </html>
     )
   }
   ```

2. **Add fallback in component:**
   ```typescript
   export function Feed() {
     try {
       const { data: creators, isLoading } = useCreators()
       // ...
     } catch (error) {
       return <div>Something went wrong. Please refresh.</div>
     }
   }
   ```

---

## Summary of Vulnerabilities

| Issue | Severity | Impact | Mitigation |
|-------|----------|--------|-----------|
| Race condition on double-click | High | Lost updates, inconsistent data | Implement atomic operations, idempotency |
| Stale user data after logout | Medium | Information leakage, privacy | Clear cache on logout |
| Unbounded cache growth | Medium | Memory leak, performance | Implement cache size limits, debounce prefetch |
| Over-fetching on remount | Low | Wasted bandwidth, battery | Use `refetchOnMount: 'stale'` |
| No error feedback | Medium | User confusion, duplicate actions | Show error toasts/UI |
| Concurrent mutations | Medium | State corruption | Enforce single mutation per entity |
| Server-side race condition | **Critical** | Data corruption, wrong counts | Use atomic operations |
| Missing input validation | Low | Invalid data, edge cases | Validate all inputs |
| No error boundaries | Low | App crash on error | Add try-catch and error boundaries |

---

## Deployment Readiness Checklist

- [ ] Implement idempotent follow API (PATCH instead of POST)
- [ ] Add server-side atomic operations or transaction support
- [ ] Implement logout flow with cache clearing
- [ ] Add error notifications/toasts for failed mutations
- [ ] Limit prefetch cache size (max 10-20 entries)
- [ ] Add input validation for all API routes
- [ ] Add error boundaries to all pages
- [ ] Set `refetchOnMount: 'stale'` explicitly
- [ ] Monitor cache growth in production
- [ ] Add server logging for concurrent requests
- [ ] Implement request deduplication if needed
- [ ] Add rate limiting on follow endpoint

