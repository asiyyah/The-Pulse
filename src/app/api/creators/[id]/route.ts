import type { CreatorDetail } from '@/lib/types'
import { getCreatorState } from '@/lib/store'

const defaultFollowStates: Record<string, boolean> = {
  '2': true, '5': true, '8': true,
}

const baseCreatorDetails: Omit<CreatorDetail, 'isFollowing' | 'followers'>[] = [
  { id: '1', name: 'Aria Chen', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=aria', recentPosts: 38, bio: 'Digital artist and animator exploring the intersection of technology and creativity.', joinedDate: '2021-03-14', totalPosts: 412 },
  { id: '2', name: 'Marcus Webb', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=marcus', recentPosts: 62, bio: 'Full-stack developer writing about React, TypeScript, and system design.', joinedDate: '2020-07-22', totalPosts: 687 },
  { id: '3', name: 'Zara Okafor', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=zara', recentPosts: 15, bio: 'Photographer and visual storyteller capturing urban landscapes.', joinedDate: '2022-01-05', totalPosts: 234 },
  { id: '4', name: 'Leo Kim', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=leo', recentPosts: 91, bio: 'Game developer and indie studio founder. Building worlds one pixel at a time.', joinedDate: '2021-09-18', totalPosts: 1023 },
  { id: '5', name: 'Nova Patel', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=nova', recentPosts: 47, bio: 'Data scientist and ML engineer sharing insights on AI and analytics.', joinedDate: '2020-11-30', totalPosts: 521 },
  { id: '6', name: 'Isla Torres', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=isla', recentPosts: 23, bio: 'Fashion designer and sustainable style advocate.', joinedDate: '2022-04-12', totalPosts: 189 },
  { id: '7', name: 'Jasper Nguyen', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=jasper', recentPosts: 54, bio: 'Musician and producer blending electronic and acoustic sounds.', joinedDate: '2021-06-08', totalPosts: 376 },
  { id: '8', name: 'Maya Johansson', avatar: 'https://api.dicebear.com/9.x/avataaars/svg?seed=maya', recentPosts: 72, bio: 'Chef and food writer exploring global cuisines.', joinedDate: '2020-02-19', totalPosts: 845 },
]

const defaultFollowers: Record<string, number> = {
  '1': 45200, '2': 23100, '3': 89700, '4': 12400,
  '5': 67300, '6': 34100, '7': 56800, '8': 78900,
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  await new Promise((resolve) => setTimeout(resolve, 1000))

  const base = baseCreatorDetails.find((c) => c.id === id)

  if (!base) {
    return Response.json({ error: 'Creator not found' }, { status: 404 })
  }

  const stored = getCreatorState(id)

  const creator: CreatorDetail = {
    ...base,
    followers: stored?.followers ?? defaultFollowers[id],
    isFollowing: stored?.isFollowing ?? defaultFollowStates[id] ?? false,
  }

  return Response.json(creator)
}
