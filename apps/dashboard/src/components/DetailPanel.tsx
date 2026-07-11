import { useState, useEffect } from 'react'
import type { Job, FitAnalysis, WritableStatus } from '../types'
import { WRITABLE_STATUSES } from '../types'
import { VerdictBadge } from './JobCard'
import { patchJobNotes, analyzeJob } from '../api'

interface Props {
  job: Job
  onClose: () => void
  onStatusChange: (id: number, status: WritableStatus) => void
  onNotesChange: (id: number, notes: string) => void
  onAnalyzed: (id: number, analysis: FitAnalysis) => void
}

function safeArray(val: string[] | string | null | undefined): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function BulletList({ items, emptyText }: { items: string[]; emptyText?: string }) {
  if (items.length === 0) {
    return <p className="panel-empty">{emptyText ?? 'None noted.'}</p>
  }
  return (
    <ul className="panel-list">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

export default function DetailPanel({
  job, onClose, onStatusChange, onNotesChange, onAnalyzed,
}: Props) {
  const [descExpanded,  setDescExpanded]  = useState(false)
  const [notesValue,    setNotesValue]    = useState(job.notes ?? '')
  const [notesSaving,   setNotesSaving]   = useState(false)
  const [notesMsg,      setNotesMsg]      = useState<'saved' | 'error' | null>(null)
  const [analyzing,     setAnalyzing]     = useState(false)
  const [analyzeError,  setAnalyzeError]  = useState<string | null>(null)

  const a = job.latest_analysis

  // Reset per-job state when a different card is opened
  useEffect(() => {
    setNotesValue(job.notes ?? '')
    setNotesMsg(null)
    setAnalyzeError(null)
  }, [job.id])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleSaveNotes() {
    setNotesSaving(true)
    setNotesMsg(null)
    try {
      await patchJobNotes(job.id, notesValue)
      onNotesChange(job.id, notesValue)
      setNotesMsg('saved')
      setTimeout(() => setNotesMsg(null), 2500)
    } catch {
      setNotesMsg('error')
    } finally {
      setNotesSaving(false)
    }
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    setAnalyzeError(null)
    try {
      const analysis = await analyzeJob(job.id)
      onAnalyzed(job.id, analysis)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'PROVIDER_NOT_CONFIGURED') {
        setAnalyzeError(
          'AI provider not configured. Check backend .env or set AI_PROVIDER=mock.'
        )
      } else {
        setAnalyzeError(msg || 'Analysis failed. Check the backend is running.')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  const PREVIEW_LEN = 400
  const desc = job.description ?? ''
  const descTruncated = desc.length > PREVIEW_LEN && !descExpanded

  const pros          = safeArray(a?.pros_json)
  const cons          = safeArray(a?.cons_json)
  const risks         = safeArray(a?.risks_json)
  const missingSkills = safeArray(a?.missing_skills_json)
  const prepTopics    = safeArray(a?.prep_topics_json)

  const currentWritable = (['saved', 'applied', 'interview', 'archived'] as WritableStatus[])
    .includes(job.status as WritableStatus)
    ? job.status as WritableStatus
    : 'archived'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>

        <div className="panel-header">
          <div className="panel-header-text">
            <h2 className="panel-title">{job.title}</h2>
            <span className="panel-company">{job.company}</span>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="panel-body">

          {/* Meta */}
          <section className="panel-section">
            {job.location && (
              <div className="panel-meta-row">
                <span className="panel-meta-label">Location</span>
                <span>{job.location}</span>
              </div>
            )}
            {job.url && (
              <div className="panel-meta-row">
                <span className="panel-meta-label">LinkedIn</span>
                <a href={job.url} target="_blank" rel="noreferrer" className="panel-link">
                  Open posting ↗
                </a>
              </div>
            )}
          </section>

          {/* Status */}
          <section className="panel-section">
            <label className="panel-label">Status</label>
            <select
              className="panel-select"
              value={currentWritable}
              onChange={e => onStatusChange(job.id, e.target.value as WritableStatus)}
            >
              {WRITABLE_STATUSES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </section>

          {/* Description */}
          {desc && (
            <section className="panel-section">
              <label className="panel-label">Description</label>
              <p className="panel-desc">
                {descTruncated ? desc.slice(0, PREVIEW_LEN) + '…' : desc}
              </p>
              {desc.length > PREVIEW_LEN && (
                <button
                  className="panel-toggle"
                  onClick={() => setDescExpanded(x => !x)}
                >
                  {descExpanded ? 'Show less' : 'Show full description'}
                </button>
              )}
            </section>
          )}

          {/* Notes — always editable */}
          <section className="panel-section">
            <label className="panel-label">Notes</label>
            <textarea
              className="notes-textarea"
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              rows={4}
              placeholder="Add your notes…"
            />
            <div className="notes-save-row">
              <button
                className="btn-save-notes"
                onClick={handleSaveNotes}
                disabled={notesSaving}
              >
                {notesSaving ? 'Saving…' : 'Save notes'}
              </button>
              {notesMsg === 'saved' && (
                <span className="notes-msg notes-msg-ok">Saved</span>
              )}
              {notesMsg === 'error' && (
                <span className="notes-msg notes-msg-err">Failed to save</span>
              )}
            </div>
          </section>

          {/* Analysis */}
          {a ? (
            <section className="panel-section panel-analysis">
              <div className="analysis-header">
                <label className="panel-label">AI Analysis</label>
                <div className="analysis-header-right">
                  <VerdictBadge verdict={a.verdict} />
                  <span className="analysis-score">
                    {a.fit_score.toFixed(1)}
                    <span className="analysis-score-denom">/10</span>
                  </span>
                </div>
              </div>

              {/* Re-analyze */}
              <div className="analyze-row">
                <button className="btn-analyze" onClick={handleAnalyze} disabled={analyzing}>
                  {analyzing ? 'Analyzing…' : 'Re-analyze job'}
                </button>
                {analyzeError && (
                  <span className="analyze-error">{analyzeError}</span>
                )}
              </div>

              {a.recommended_action && (
                <div className="analysis-action">
                  <span className="analysis-action-label">Recommended action</span>
                  <p>{a.recommended_action}</p>
                </div>
              )}

              {a.why && (
                <div className="analysis-block">
                  <span className="analysis-block-label">Why this verdict</span>
                  <p>{a.why}</p>
                </div>
              )}

              <div className="analysis-grid">
                {a.seniority_estimate && (
                  <div className="analysis-pill-row">
                    <span className="analysis-pill-label">Seniority</span>
                    <span className="analysis-pill">{a.seniority_estimate}</span>
                  </div>
                )}
                {a.salary_signal && a.salary_signal !== 'unknown' && (
                  <div className="analysis-pill-row">
                    <span className="analysis-pill-label">Salary signal</span>
                    <span className="analysis-pill">{a.salary_signal}</span>
                  </div>
                )}
              </div>

              <div className="analysis-block">
                <span className="analysis-block-label">Pros</span>
                <BulletList items={pros} />
              </div>

              <div className="analysis-block">
                <span className="analysis-block-label">Cons</span>
                <BulletList items={cons} />
              </div>

              {risks.length > 0 && (
                <div className="analysis-block">
                  <span className="analysis-block-label">Risks</span>
                  <BulletList items={risks} />
                </div>
              )}

              {missingSkills.length > 0 && (
                <div className="analysis-block">
                  <span className="analysis-block-label">Missing skills</span>
                  <BulletList items={missingSkills} />
                </div>
              )}

              {prepTopics.length > 0 && (
                <div className="analysis-block">
                  <span className="analysis-block-label">Prep topics</span>
                  <BulletList items={prepTopics} />
                </div>
              )}
            </section>
          ) : (
            <section className="panel-section">
              <label className="panel-label">AI Analysis</label>
              <div className="analyze-row">
                <button className="btn-analyze" onClick={handleAnalyze} disabled={analyzing}>
                  {analyzing ? 'Analyzing…' : 'Analyze job'}
                </button>
                {analyzeError && (
                  <span className="analyze-error">{analyzeError}</span>
                )}
              </div>
            </section>
          )}

        </div>
      </div>
    </div>
  )
}
