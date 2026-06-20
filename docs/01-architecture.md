# The Pulse — Key Architecture Decisions

This document captures the three most important architectural decisions in The Pulse, along with why each approach was chosen, available alternatives, the tradeoffs involved, and when not to use it.

## 1. Next.js App Router with server and client components

### Why it was chosen

- The project uses **Next.js 16 App Router** to combine server-rendered page structure with interactive client components.
- `layout.tsx` and `page.tsx` are server components, while interactive UI and data fetching are isolated behind `'use client'` boundaries.
- This enables fast initial rendering, built-in routing, and native support for API routes under `src/app/api`.

### Alternatives

- Next.js Pages Router (`pages/` directory).
- A plain React SPA built with Vite or Create React App.
- Remix, Astro, or another meta-framework.
- A backend + frontend split with a separate API server.

### Tradeoffs

- Benefits: integrated routing, SSR/SSG support, good developer ergonomics, built-in API route hosting, and a clear separation of server/cient behavior.
- Costs: extra conceptual complexity from server/client boundaries, more Next.js-specific conventions, and dependency on Next.js runtime.
- The App Router works well for this kind of feed-driven app, but it can add overhead for extremely small or purely static sites.

### When not to use it

- When building a tiny static landing page with no data fetching.
- When you need a completely framework-agnostic frontend or a non-React stack.
- When you want a separate production API service or microservices architecture instead of Next.js API routes.

## 2. TanStack Query for data fetching, caching, and optimistic updates

### Why it was chosen

- The app uses **TanStack Query** to manage asynchronous data, caching, background refetching, and mutation state.
- Hooks in `src/hooks/useCreators.ts` and `src/hooks/useFollowCreator.ts` centralize the queries and optimistic update logic.
- This enables instant UI response for follow/unfollow actions and easy cache invalidation.

### Alternatives

- SWR for caching and revalidation.
- Redux Toolkit Query or Apollo Client for query/mutation management.
- Custom `useState` + `useEffect` fetch hooks without a caching library.
- A global state manager like Redux, Zustand, or Jotai.

### Tradeoffs

- Benefits: robust caching, mutation lifecycle hooks, prefetching support, and fewer manual loading/error states.
- Costs: added dependency, learning curve for query keys and mutation behavior, and more runtime abstraction.
- TanStack Query is ideal for interactive list data, but it may be overkill for a simple app with one fetch and no mutation logic.

### When not to use it

- When the app only needs a single one-off fetch and no caching semantics.
- When the project already depends on another data layer like RTK Query or Apollo and the team prefers consistency.
- When minimizing bundle size is more important than developer convenience for async state.

## 3. In-process Next.js API routes backed by an in-memory store

### Why it was chosen

- The project uses Next.js API routes in `src/app/api` to keep frontend and backend logic in one repository.
- `src/lib/store.ts` provides a lightweight in-memory state store for follow state and follower counts.
- This makes the app self-contained for demos and prototyping without external persistence.

### Alternatives

- A persistent database (PostgreSQL, SQLite, etc.) behind the API.
- An external backend or headless CMS.
- Static JSON or mock data consumed directly by the frontend.
- Serverless functions hosted separately from the Next.js app.

### Tradeoffs

- Benefits: fast iteration, zero infrastructure, and easier local development.
- Costs: no durability, state resets when the server restarts, and inability to scale across multiple instances.
- The in-memory store is fine for a demo and local proof-of-concept, but it is not production-ready.

### When not to use it

- When you need durable persistence or multi-user state across restarts.
- When the application must run in a distributed or serverless environment with multiple instances.
- When the backend should remain decoupled from the frontend.
