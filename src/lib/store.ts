export interface CreatorState {
  isFollowing: boolean
  followers: number
}

const store: Record<string, CreatorState> = {}

export function getCreatorState(id: string): CreatorState | undefined {
  return store[id]
}

export function setCreatorState(id: string, state: CreatorState): void {
  store[id] = state
}
