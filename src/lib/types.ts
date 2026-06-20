export interface Creator {
  id: string
  name: string
  avatar: string
  followers: number
  recentPosts: number
  isFollowing: boolean
}

export interface CreatorDetail extends Creator {
  bio: string
  joinedDate: string
  totalPosts: number
}

export interface FollowResponse {
  isFollowing: boolean
  followers: number
}
