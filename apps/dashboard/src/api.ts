import type { Job, WritableStatus, UserProfile, UserProfileUpdate, FitAnalysis, JobBrief } from './types'

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

export async function analyzeJob(jobId: number): Promise<FitAnalysis> {
  const res = await fetch(`${API}/jobs/${jobId}/analyze`, { method: 'POST' })
  if (!res.ok) {
    if (res.status === 400) throw new Error('PROVIDER_NOT_CONFIGURED')
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail ?? `POST /jobs/${jobId}/analyze failed: ${res.status}`)
  }
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

export async function generateJobBrief(jobId: number): Promise<JobBrief> {
  const res = await fetch(`${API}/jobs/${jobId}/brief`, { method: 'POST' })
  if (!res.ok) {
    if (res.status === 400) throw new Error('PROVIDER_NOT_CONFIGURED')
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail ?? `POST /jobs/${jobId}/brief failed: ${res.status}`)
  }
  return res.json()
}

export async function uploadResume(file: File): Promise<UserProfile> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${API}/profile/resume`, { method: 'POST', body: form })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.detail ?? `POST /profile/resume failed: ${res.status}`)
  }
  return res.json()
}
