# Security & Vulnerability Audit

## Severity Key

| Label | Meaning |
|---|---|
| **CRIT** | Exploitable in production, low barrier to entry |
| **HIGH** | Realistic risk, likely to cause data loss or incorrect state |
| **MED** | Problematic under specific conditions, limited blast radius |
| **LOW** | Minor concern, informational |

---

## 1. Server-Side Race Conditions

### 1.1 Concurrent POST to `/api/follow/:id` — Lost Update (CRIT)

**File:** `src/app/api/follow/[id]/route.ts:23-30`

```ts
const current = getCreatorState(id)           // read
const newIsFollowing = !currentIsFollowing     // transform
const newFollowers = newIsFollowing ? ... : ...
setCreatorState(id, { ... })                   // write
```

The plain-object store has no locking or atomic compare-and-swap. Two concurrent requests for the **same creator ID** can interleave:

| Time | Request A (follow) | Request B (follow) |
|---|---|---|
| T1 | reads `isFollowing=false` | |
| T2 | | reads `isFollowing=false` |
| T3 | writes `isFollowing=true` | |
| T4 | | writes `isFollowing=true` |

**Result:** One toggle is silently lost. Follower count is also wrong — both read `followers=100`, both write `101`.

The 1-second `await new Promise(...)` widens the race window considerably. Two requests arriving within the same second will always collide.

**Likelihood:** High — any user who triggers two follow actions in quick succession hits this.

---

### 1.2 Concurrent Mutations on the Client (HIGH)

**File:** `src/components/CreatorCard.tsx:16`

```ts
const isMutating = followMutation.isPending && followMutation.variables === creator.id
```

This guard only blocks re-mutation of the **same** creator ID while the mutation is in-flight. If the user:

1. Clicks **Follow** on creator A (mutation starts, `variables = 'A'`)
2. Quickly clicks **Follow** on creator B (before A's mutation settles)

...`variables` now equals `'B'`, so the guard **passes** for B. Two mutations now run concurrently, each with their own `onMutate`/`onError`/`onSettled`.

**Worst-case cascade:**

| Step | Event |
|---|---|
| 1 | `mutate('A')` → `onMutate` cancels queries, snapshots cache, optimistically updates A |
| 2 | `mutate('B')` → `onMutate` cancels queries (already cancelled, no-op), snapshots cache **(includes A's optimistic change)**, optimistically updates B |
| 3 | A's mutation **fails** → `onError` restores `previousCreators` **(captured at step 2, after A's edit)** |
| 4 | A's changes are now baked into the snapshot and survive rollback. B's changes are fully reverted. Cache is in an inconsistent state. |

The same flaw applies if B fails instead: `onSettled` fires after each mutation, calling `invalidateQueries` twice and triggering two refetches — the second of which may overwrite the first with stale data.

---

## 2. Optimistic Update / Rollback Edge Cases

### 2.1 Stale Snapshot Rollback (HIGH)

**File:** `src/hooks/useFollowCreator.ts:34-37`

```ts
onError: (_error, _creatorId, context) => {
  if (context?.previousCreators) {
    queryClient.setQueryData<Creator[]>(CREATORS_KEY, context.previousCreators)
  }
}
```

`context.previousCreators` is captured once at mutation start. If **any other mutation, refetch, or cache update** modifies the `['creators']` cache between `onMutate` and `onError`, the rollback **silently reverts those changes too**. This is a blanket overwrite, not a merge.

### 2.2 `onMutate` Throw Leaves Cache Mid-Edit (MED)

If `cancelQueries` or `setQueryData` throws inside `onMutate`, the mutation fails. `onError` is still called, but `context` is `undefined`, so the rollback is skipped. However, `cancelQueries` may have already run, and partial changes from `setQueryData` may have been applied. The cache is left in a broken state until the next refetch.

### 2.3 No Pessimistic Fallback (MED)

The client always applies the optimistic toggle immediately, then refetches on settle. If the cache is already stale (e.g., from a previous error or race), the `!creator.isFollowing` computation is based on bad data, and the toggle is double-flipped. The invalidation eventually corrects it, but there is a window of incorrect UI.

### 2.4 Garbage-Collected `previousCreators` (LOW)

If the `['creators']` cache was garbage-collected (`gcTime: 5min`) between the initial fetch and the mutation, `getQueryData` returns `undefined`. The optimistic update short-circuits (`if (!old) return old`), so no edit is applied. If the mutation then fails, `previousCreators` is `undefined`, and `onError` skips the rollback — which is correct, but means the user sees no UI feedback at all.

---

## 3. No Authentication or Authorization (HIGH)

**File:** `src/app/api/follow/[id]/route.ts`

- Any client can call `POST /api/follow/:id` with any creator ID.
- No user identity, no session, no API key.
- No rate limiting — a script could rapidly spam follow/unfollow and thrash the store.
- Since `store.ts` is process-local and shared by all requests, one user's actions immediately affect all other users.

**Impact:** In a multi-user deployment, this is a full account-takeover-by-proxy (anyone can modify anyone's follow state). For this demo it's by design, but the gaps are worth documenting.

---

## 4. CSRF (MED)

**File:** `src/app/api/follow/[id]/route.ts`

The POST endpoint accepts `application/json` (default fetch) but uses no CSRF token, `SameSite` cookie, or origin/referer check. If a user visits a malicious site while authenticated (in a real auth setup), the attacker could forge follow/unfollow requests.

---

## 5. XSS via Avatar URL (LOW)

**File:** `src/components/CreatorCard.tsx:36`

```tsx
<img src={creator.avatar} alt={creator.name} />
```

An `<img>` tag with a `javascript:` URL does not execute in modern browsers, so this is safe for images. However, if the data source is ever user-controllable and the URL were used in a different context (e.g., `<a href={creator.avatar}>`), script injection would be possible. Currently all URLs are hardcoded on the server.

---

## 6. No Input Validation on URL Params (LOW)

**File:** `src/app/api/creators/[id]/route.ts:28`

```ts
const { id } = await params
```

Used directly as a Record key and passed through `getCreatorState(id)`. While there's no injection vector here (object key lookup is safe), there's no length limit, no type check, and no 404 for unexpected formats. Passing a non-existent ID returns a proper 404 from the `baseCreatorDetails.find(...)`, but `getCreatorState` would silently return `undefined`.

---

## 7. Error Message Leak (LOW)

**File:** `src/lib/api.ts:9`

```ts
throw new Error(`Request failed: ${response.status} ${response.statusText}`)
```

`statusText` is typically benign (e.g., "OK", "Not Found"), but in non-standard configurations it could contain server-identifying information. The error propagates uncaught — there is no error boundary in the component tree to catch it gracefully.

---

## 8. Process-Local Store Is Not Persistent (INFO)

**File:** `src/lib/store.ts`

The entire follow state lives in a module-level `Record<string, CreatorState>` object. This is lost on:
- Server restart / deploy
- Process crash
- Horizontal scale-out (each process has its own copy)
- Lambda cold starts (if deployed on serverless)

For a demo this is acceptable. For production, this must be replaced with a database.

---

## Summary

| # | Issue | Severity | Mitigation |
|---|---|---|---|
| 1.1 | Concurrent POST lost update | **CRIT** | Database-level atomic write or row-level locking |
| 1.2 | Concurrent client mutations overwrite snapshots | **HIGH** | Serialize mutations per creator or scope `onMutate` rollback to the specific changed item |
| 2.1 | Stale snapshot restores other creators' state | **HIGH** | Merge rollback instead of full replace; scope to the affected creator ID |
| 2.2 | `onMutate` throw leaves partial cache | **MED** | Wrap `onMutate` body in try/catch |
| 2.3 | No pessimistic fallback | **MED** | Use server response as source of truth; only keep optimistic state until settle |
| 3 | No auth/identity/rate-limit | **HIGH** | Add authentication layer and per-user rate limiting |
| 4 | No CSRF protection | **MED** | Add `SameSite=Strict` cookie; validate `Origin`/`Referer` headers |
| 5 | Avatar URL source | **LOW** | Sanitize if user-supplied avatars are ever added |
| 6 | URL param validation | **LOW** | Validate `id` is a known creator ID; set length limits |
| 7 | Uncaught errors + message leak | **LOW** | Add error boundary; sanitize error messages in production |
| 8 | Non-persistent store | **INFO** | Replace with database for production |

---

## Recommended Fix: Race-Condition-Resistant Rollback

The central fix for issues 1.2 and 2.1 is to scope rollback to the **single affected creator** instead of replacing the entire cache:

```ts
onMutate: async (creatorId: string) => {
  await queryClient.cancelQueries({ queryKey: CREATORS_KEY })
  const previous = queryClient.getQueryData<Creator[]>(CREATORS_KEY)
  return { previous, creatorId }
},
onError: (_error, _creatorId, context) => {
  if (!context?.previous) return
  queryClient.setQueryData<Creator[]>(CREATORS_KEY, (old) => {
    if (!old) return old
    const prevCreator = context.previous.find((c) => c.id === context.creatorId)
    if (!prevCreator) return old
    return old.map((c) => (c.id === context.creatorId ? prevCreator : c))
  })
},
```

This only reverts the row that was changed, preserving any other optimistic updates in the cache.
