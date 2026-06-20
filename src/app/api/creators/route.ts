import type { Creator } from '@/lib/types'
import { getCreatorState } from '@/lib/store'

const baseCreators: Omit<Creator, 'isFollowing' | 'followers'>[] = [
  { id: '1', name: 'Aria Chen', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=aria', recentPosts: 38 },
  { id: '2', name: 'Marcus Webb', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=marcus', recentPosts: 62 },
  { id: '3', name: 'Zara Okafor', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=zara', recentPosts: 15 },
  { id: '4', name: 'Leo Kim', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=leo', recentPosts: 91 },
  { id: '5', name: 'Nova Patel', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=nova', recentPosts: 47 },
  { id: '6', name: 'Isla Torres', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=isla', recentPosts: 23 },
  { id: '7', name: 'Jasper Nguyen', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=jasper', recentPosts: 54 },
  { id: '8', name: 'Maya Johansson', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=maya', recentPosts: 72 },
]

const defaultFollowStates: Record<string, boolean> = {
  '2': true,
  '5': true,
  '8': true,
}

const defaultFollowers: Record<string, number> = {
  '1': 45200, '2': 23100, '3': 89700, '4': 12400,
  '5': 67300, '6': 34100, '7': 56800, '8': 78900,
}

export async function GET() {
  await new Promise((resolve) => setTimeout(resolve, 1000))

  const creators: Creator[] = baseCreators.map((base) => {
    const stored = getCreatorState(base.id)
    return {
      ...base,
      followers: stored?.followers ?? defaultFollowers[base.id],
      isFollowing: stored?.isFollowing ?? defaultFollowStates[base.id] ?? false,
    }
  })

  return Response.json(creators)
}
