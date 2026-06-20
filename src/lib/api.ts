import type { Creator, CreatorDetail, FollowResponse } from './types'

const BASE_URL = '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export function fetchCreators(): Promise<Creator[]> {
  return request<Creator[]>(`${BASE_URL}/creators`)
}

export function fetchCreator(id: string): Promise<CreatorDetail> {
  return request<CreatorDetail>(`${BASE_URL}/creators/${id}`)
}

export function followCreator(id: string): Promise<FollowResponse> {
  return request<FollowResponse>(`${BASE_URL}/follow/${id}`, {
    method: 'POST',
  })
}
