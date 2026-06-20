import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchCreators, fetchCreator } from '@/lib/api'
import type { Creator, CreatorDetail } from '@/lib/types'

export const CREATORS_KEY = ['creators'] as const

export function useCreators() {
  return useQuery<Creator[]>({
    queryKey: CREATORS_KEY,
    queryFn: fetchCreators,
  })
}

export function useCreatorDetail(id: string) {
  return useQuery<CreatorDetail>({
    queryKey: ['creator', id],
    queryFn: () => fetchCreator(id),
    enabled: false,
  })
}

export function usePrefetchCreator() {
  const queryClient = useQueryClient()

  return (id: string) => {
    queryClient.prefetchQuery({
      queryKey: ['creator', id],
      queryFn: () => fetchCreator(id),
      staleTime: 30_000,
    })
  }
}
