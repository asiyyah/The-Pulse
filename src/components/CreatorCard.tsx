'use client'

import { memo, useCallback, useRef } from 'react'
import type { Creator } from '@/lib/types'
import { useFollowCreator } from '@/hooks/useFollowCreator'
import { usePrefetchCreator } from '@/hooks/useCreators'

interface CreatorCardProps {
  creator: Creator
}

function CreatorCardInner({ creator }: CreatorCardProps) {
  const followMutation = useFollowCreator()
  const prefetchCreator = usePrefetchCreator()
  const pendingActionRef = useRef<'follow' | 'unfollow' | null>(null)

  const isMutating = followMutation.isPending && followMutation.variables === creator.id

  const handleFollow = useCallback(() => {
    if (isMutating) return
    pendingActionRef.current = creator.isFollowing ? 'unfollow' : 'follow'
    followMutation.mutate(creator.id)
  }, [followMutation, creator.id, isMutating, creator.isFollowing])

  const handleMouseEnter = useCallback(() => {
    prefetchCreator(creator.id)
  }, [prefetchCreator, creator.id])

  const formattedFollowers = creator.followers.toLocaleString()

  return (
    <div
      className="group rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      onMouseEnter={handleMouseEnter}
    >
      <div className="flex flex-col items-center text-center">
        <img
          src={creator.avatar}
          alt={creator.name}
          className="mb-3 h-16 w-16 rounded-full bg-zinc-100 dark:bg-zinc-800"
        />

        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {creator.name}
        </h3>

        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {formattedFollowers} followers
        </p>

        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {creator.recentPosts} recent posts
        </p>

        <button
          onClick={handleFollow}
          disabled={isMutating}
          className={`mt-4 w-full rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            creator.isFollowing
              ? 'border border-zinc-300 bg-white text-zinc-700 hover:border-red-300 hover:text-red-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-red-700 dark:hover:text-red-400'
              : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200'
          }`}
        >
          {isMutating
            ? pendingActionRef.current === 'follow'
              ? 'Following...'
              : 'Unfollowing...'
            : creator.isFollowing
              ? 'Unfollow'
              : 'Follow'}
        </button>
      </div>
    </div>
  )
}

export const CreatorCard = memo(CreatorCardInner)
