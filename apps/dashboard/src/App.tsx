import { useEffect, useState, useCallback } from 'react'
import type { Job, WritableStatus } from './types'
import { listJobs, patchJobStatus } from './api'
import StatsRow from './components/StatsRow'
import Board from './components/Board'
import DetailPanel from './components/DetailPanel'
import ProfileModal from './components/ProfileModal'

export default function App() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showProfile, setShowProfile] = useState(false)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listJobs()
      setJobs(data)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const isOffline = msg.includes('Failed to fetch') || msg.includes('NetworkError')
      setError(
        isOffline
          ? 'Backend offline. Start FastAPI on localhost:8000.'
          : `Error loading jobs: ${msg}`
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  // Used by both the status dropdown in DetailPanel and drag-and-drop.
  // Optimistic update first; reverts and surfaces an error if PATCH fails.
  const handleStatusChange = useCallback(async (id: number, status: WritableStatus) => {
    setUpdateError(null)
    setJobs(prev => prev.map(j => (j.id === id ? { ...j, status } : j)))
    try {
      const updated = await patchJobStatus(id, status)
      setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...updated } : j)))
    } catch {
      fetchJobs()
      setUpdateError('Status update failed — change reverted.')
    }
  }, [fetchJobs])

  const selectedJob = jobs.find(j => j.id === selectedId) ?? null

  const filtered = query.trim()
    ? jobs.filter(j => {
        const q = query.toLowerCase()
        return j.title.toLowerCase().includes(q) || j.company.toLowerCase().includes(q)
      })
    : jobs

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-left">
          <span className="app-logo">RoleRadar AI</span>
          <span className="app-subtitle">Job pipeline</span>
        </div>
        <div className="app-header-right">
          <input
            className="search-input"
            type="text"
            placeholder="Search title or company…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button
            className="btn-profile"
            onClick={() => setShowProfile(true)}
            title="Edit career profile"
          >
            Profile
          </button>
          <button
            className="btn-refresh"
            onClick={fetchJobs}
            disabled={loading}
            title="Refresh"
          >
            {loading ? '…' : '↺ Refresh'}
          </button>
        </div>
      </header>

      <StatsRow jobs={jobs} />

      {updateError && (
        <div className="update-error-banner">
          <span>{updateError}</span>
          <button onClick={() => setUpdateError(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {error && (
        <div className="error-banner">{error}</div>
      )}

      {!error && (
        <Board
          jobs={filtered}
          onSelect={setSelectedId}
          selectedId={selectedId}
          onStatusChange={handleStatusChange}
        />
      )}

      {showProfile && (
        <ProfileModal onClose={() => setShowProfile(false)} />
      )}

      {selectedJob && (
        <DetailPanel
          job={selectedJob}
          onClose={() => setSelectedId(null)}
          onStatusChange={handleStatusChange}
          onNotesChange={(id, notes) =>
            setJobs(prev => prev.map(j => j.id === id ? { ...j, notes } : j))
          }
          onAnalyzed={(id, analysis) =>
            setJobs(prev => prev.map(j =>
              j.id === id ? { ...j, latest_analysis: analysis, analyzed_at: new Date().toISOString() } : j
            ))
          }
        />
      )}
    </div>
  )
}
