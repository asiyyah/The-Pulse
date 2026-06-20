import { getCreatorState, setCreatorState } from '@/lib/store'

const defaultFollowers: Record<string, number> = {
  '1': 45200, '2': 23100, '3': 89700, '4': 12400,
  '5': 67300, '6': 34100, '7': 56800, '8': 78900,
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  await new Promise((resolve) => setTimeout(resolve, 1000))

  if (Math.random() < 0.2) {
    return Response.json(
      { error: 'Network error. Please try again.' },
      { status: 500 },
    )
  }

  const current = getCreatorState(id)
  const currentIsFollowing = current?.isFollowing ?? false
  const currentFollowers = current?.followers ?? defaultFollowers[id] ?? 0

  const newIsFollowing = !currentIsFollowing
  const newFollowers = newIsFollowing ? currentFollowers + 1 : currentFollowers - 1

  setCreatorState(id, { isFollowing: newIsFollowing, followers: newFollowers })

  return Response.json({
    isFollowing: newIsFollowing,
    followers: newFollowers,
  })
}
