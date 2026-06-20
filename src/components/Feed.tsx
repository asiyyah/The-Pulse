'use client'

import { useCreators } from '@/hooks/useCreators'
import { CreatorCard } from './CreatorCard'
import { RefreshButton } from './RefreshButton'

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 h-16 w-16 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        <div className="mb-2 h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="mb-1 h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="mb-4 h-3 w-16 rounded bg-zinc-100 dark:bg-zinc-800" />
        <div className="h-9 w-full rounded-lg bg-zinc-200 dark:bg-zinc-700" />
      </div>
    </div>
  )
}

export function Feed() {
  const { data: creators, isLoading, isFetching } = useCreators()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Trending Creators
        </h2>
        <RefreshButton isRefreshing={isFetching} />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {creators?.map((creator) => (
            <CreatorCard key={creator.id} creator={creator} />
          ))}
        </div>
      )}
    </div>
  )
}
