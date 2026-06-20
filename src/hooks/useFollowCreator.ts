import { useMutation, useQueryClient } from '@tanstack/react-query'
import { followCreator } from '@/lib/api'
import { CREATORS_KEY } from './useCreators'
import type { Creator } from '@/lib/types'

export function useFollowCreator() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: followCreator,
    onMutate: async (creatorId: string) => {
      await queryClient.cancelQueries({ queryKey: CREATORS_KEY })

      const previousCreators = queryClient.getQueryData<Creator[]>(CREATORS_KEY)

      queryClient.setQueryData<Creator[]>(CREATORS_KEY, (old) => {
        if (!old) return old
        return old.map((creator) => {
          if (creator.id === creatorId) {
            return {
              ...creator,
              isFollowing: !creator.isFollowing,
              followers: creator.isFollowing
                ? creator.followers - 1
                : creator.followers + 1,
            }
          }
          return creator
        })
      })

      return { previousCreators }
    },
    onError: (_error, _creatorId, context) => {
      if (context?.previousCreators) {
        queryClient.setQueryData<Creator[]>(CREATORS_KEY, context.previousCreators)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: CREATORS_KEY })
    },
  })
}
