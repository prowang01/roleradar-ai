import type { Job, WritableStatus, UserProfile, UserProfileUpdate } from './types'

const API = 'http://localhost:8000'

export async function listJobs(): Promise<Job[]> {
  const res = await fetch(`${API}/jobs`)
  if (!res.ok) throw new Error(`GET /jobs failed: ${res.status}`)
  return res.json()
}

export async function patchJobStatus(id: number, status: WritableStatus): Promise<Job> {
  const res = await fetch(`${API}/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error(`PATCH /jobs/${id} failed: ${res.status}`)
  return res.json()
}

export async function patchJobNotes(id: number, notes: string): Promise<Job> {
  const res = await fetch(`${API}/jobs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  })
  if (!res.ok) throw new Error(`PATCH /jobs/${id} failed: ${res.status}`)
  return res.json()
}

export async function getProfile(): Promise<UserProfile> {
  const res = await fetch(`${API}/profile`)
  if (!res.ok) throw new Error(`GET /profile failed: ${res.status}`)
  return res.json()
}

export async function updateProfile(data: UserProfileUpdate): Promise<UserProfile> {
  const res = await fetch(`${API}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error(`PUT /profile failed: ${res.status}`)
  return res.json()
}
