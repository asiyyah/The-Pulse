# The Pulse — Architecture

## Project Overview

A creator discovery feed built with **Next.js 16**, **React 19**, **TanStack Query**, and **Tailwind CSS v4**.

---

## Directory Structure

```
src/
├── app/                    # Next.js App Router (routes + layout)
│   ├── api/
│   │   ├── creators/
│   │   │   ├── route.ts          # GET /api/creators — list all creators
│   │   │   └── [id]/
│   │   │       └── route.ts      # GET /api/creators/:id — single creator detail
│   │   └── follow/
│   │       └── [id]/
│   │           └── route.ts      # POST /api/follow/:id — toggle follow
│   ├── globals.css               # Tailwind v4 imports + theme variables
│   ├── layout.tsx                # Root layout (fonts, metadata, Providers wrapper)
│   ├── page.tsx                  # Home page (server component, renders <Feed>)
│   └── providers.tsx             # QueryClientProvider setup (client component)
│
├── components/              # UI components
│   ├── CreatorCard.tsx       # Creator card with follow button + optimistic update
│   ├── Feed.tsx              # Feed grid with loading skeletons
│   └── RefreshButton.tsx     # Manual refresh trigger
│
├── hooks/                   # TanStack Query hooks
│   ├── useCreators.ts        # useCreators, useCreatorDetail, usePrefetchCreator
│   └── useFollowCreator.ts   # useFollowCreator — mutation with optimistic update
│
└── lib/                     # Shared utilities
    ├── api.ts               # Typed fetch wrappers
    ├── queryClient.ts       # QueryClient factory (30s staleTime, 5min gcTime)
    ├── store.ts             # In-memory store for follow state (no database)
    └── types.ts             # TypeScript interfaces (Creator, CreatorDetail, FollowResponse)
```

| Top-level config | Purpose |
|---|---|
| `next.config.ts` | Next.js configuration |
| `postcss.config.mjs` / `tailwind.config.ts` | Tailwind v4 + PostCSS |
| `tsconfig.json` | TypeScript config |
| `eslint.config.mjs` | ESLint (flat config) |
| `package.json` | Dependencies and scripts |

---

## Data Flow

```
User Action → Component → Hook → API Module → Server Route → Store → Response → Cache Update → UI Re-render
```

### Page Load

1. `layout.tsx` wraps children in `<Providers>` which creates a `QueryClient` (30s staleTime, 5min gcTime).
2. `page.tsx` (server component) renders the `<Feed>` client component.
3. `Feed` calls `useCreators()` → `useQuery(['creators'], fetchCreators)`.
4. `fetchCreators()` calls `GET /api/creators` → server reads from the in-memory `store.ts` and returns all 8 `Creator` objects (1s simulated delay).
5. TanStack Query caches the result. `Feed` shows skeleton cards during `isLoading`, then renders a grid of `CreatorCard`s.

### Hover — Prefetch Detail

1. `onMouseEnter` on `CreatorCard` fires `prefetchCreator(id)`.
2. Issues `GET /api/creators/:id` in the background to warm the `['creator', id]` cache.

### Click Follow/Unfollow

1. `CreatorCard.handleFollow()` calls `followMutation.mutate(creator.id)`.
2. `onMutate` runs synchronously **before** the network:
   - Cancels any in-flight `['creators']` queries.
   - **Optimistically updates** the cached creator list: flips `isFollowing`, adjusts `followers` by ±1.
   - Saves `previousCreators` for rollback.
3. The button instantly reflects the new state ("Following" / "Follow").
4. Network request fires: `POST /api/follow/:id`.
5. Server toggles the state in `store.ts` and responds with the new `{ isFollowing, followers }`.
6. On **settle** (success or error): invalidates `['creators']` to refetch fresh data from server.
7. On **error** (20% chance): restores `previousCreators` from context, reverting the optimistic UI.

### Manual Refresh

1. `RefreshButton` calls `queryClient.invalidateQueries(['creators'])`.
2. Marks cached data as stale → TanStack Query refetches `GET /api/creators`.
3. UI updates with fresh data.

---

## Key Architecture Decisions

- **Optimistic updates** via TanStack Query's `onMutate` / `onError` provide instant feedback while keeping the server as source of truth.
- **No real database** — follow state is persisted in a module-level `Record` (`lib/store.ts`) that survives API calls within the same process but resets on server restart.
- **TanStack Query** handles caching, deduplication, background refetching, and invalidation — no global state manager needed.
- **Server components** (`layout.tsx`, `page.tsx`) are entry points; all interactive pieces are `'use client'` components.
- **Tailwind v4** uses the new `@import "tailwindcss"` and `@theme inline` directives.
