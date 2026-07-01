import type { Job, WritableStatus } from './types'

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
