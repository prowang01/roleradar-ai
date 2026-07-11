import { useState, useEffect } from 'react'
import type { Job, FitAnalysis, WritableStatus, JobBrief } from '../types'
import { WRITABLE_STATUSES } from '../types'
import { VerdictBadge } from './JobCard'
import { patchJobNotes, analyzeJob, generateJobBrief } from '../api'

interface Props {
  job: Job
  onClose: () => void
  onStatusChange: (id: number, status: WritableStatus) => void
  onNotesChange: (id: number, notes: string) => void
  onAnalyzed: (id: number, analysis: FitAnalysis) => void
  onBriefGenerated: (id: number, brief: JobBrief) => void
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

function BriefView({ brief }: { brief: JobBrief }) {
  const hasSalary = brief.salary_location_remote && brief.salary_location_remote !== 'Not mentioned.'
  const hasCompanyCtx = brief.company_context && brief.company_context !== 'Not mentioned.'
  const hasTeamCtx = brief.team_context && brief.team_context !== 'Not mentioned.'

  return (
    <div className="brief-body">
      {brief.role_summary && (
        <p className="brief-role-summary">{brief.role_summary}</p>
      )}

      {hasSalary && (
        <div className="brief-pill-row">
          <span className="brief-pill">{brief.salary_location_remote}</span>
        </div>
      )}

      {brief.responsibilities.length > 0 && (
        <div className="brief-block">
          <span className="brief-block-label">Responsibilities</span>
          <BulletList items={brief.responsibilities} />
        </div>
      )}

      {brief.requirements.length > 0 && (
        <div className="brief-block">
          <span className="brief-block-label">Requirements</span>
          <BulletList items={brief.requirements} />
        </div>
      )}

      {brief.nice_to_have.length > 0 && (
        <div className="brief-block">
          <span className="brief-block-label">Nice to have</span>
          <BulletList items={brief.nice_to_have} />
        </div>
      )}

      {brief.seniority_signals.length > 0 && (
        <div className="brief-block">
          <span className="brief-block-label">Seniority signals</span>
          <BulletList items={brief.seniority_signals} />
        </div>
      )}

      {brief.benefits.length > 0 && (
        <div className="brief-block">
          <span className="brief-block-label">Benefits</span>
          <BulletList items={brief.benefits} />
        </div>
      )}

      {(hasCompanyCtx || hasTeamCtx) && (
        <div className="brief-block">
          <span className="brief-block-label">Context</span>
          {hasCompanyCtx && <p className="brief-context-text">{brief.company_context}</p>}
          {hasTeamCtx && <p className="brief-context-text">{brief.team_context}</p>}
        </div>
      )}

      {brief.potential_red_flags.length > 0 && (
        <div className="brief-block brief-flags">
          <span className="brief-block-label brief-flags-label">Potential red flags</span>
          <BulletList items={brief.potential_red_flags} />
        </div>
      )}

      {brief.missing_information.length > 0 && (
        <div className="brief-block brief-missing">
          <span className="brief-block-label">Missing information</span>
          <BulletList items={brief.missing_information} />
        </div>
      )}
    </div>
  )
}

export default function DetailPanel({
  job, onClose, onStatusChange, onNotesChange, onAnalyzed, onBriefGenerated,
}: Props) {
  const [notesValue,   setNotesValue]   = useState(job.notes ?? '')
  const [notesSaving,  setNotesSaving]  = useState(false)
  const [notesMsg,     setNotesMsg]     = useState<'saved' | 'error' | null>(null)
  const [analyzing,    setAnalyzing]    = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [briefing,     setBriefing]     = useState(false)
  const [briefError,   setBriefError]   = useState<string | null>(null)
  const [rawExpanded,  setRawExpanded]  = useState(false)

  const a = job.latest_analysis

  useEffect(() => {
    setNotesValue(job.notes ?? '')
    setNotesMsg(null)
    setAnalyzeError(null)
    setBriefError(null)
    setRawExpanded(false)
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
        setAnalyzeError('AI provider not configured. Check backend .env or set AI_PROVIDER=mock.')
      } else {
        setAnalyzeError(msg || 'Analysis failed. Check the backend is running.')
      }
    } finally {
      setAnalyzing(false)
    }
  }

  async function handleGenerateBrief() {
    setBriefing(true)
    setBriefError(null)
    try {
      const brief = await generateJobBrief(job.id)
      onBriefGenerated(job.id, brief)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'PROVIDER_NOT_CONFIGURED') {
        setBriefError('OpenAI key not configured. Add OPENAI_API_KEY to backend .env.')
      } else {
        setBriefError(msg || 'Brief generation failed. Check the backend is running.')
      }
    } finally {
      setBriefing(false)
    }
  }

  const PREVIEW_LEN = 400
  const desc = job.description ?? ''
  const brief = job.job_brief_json

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

          {/* Description / Brief */}
          <section className="panel-section">
            <div className="brief-header-row">
              <label className="panel-label">
                {brief ? 'Job Brief' : 'Description'}
              </label>
              <button
                className="btn-brief"
                onClick={handleGenerateBrief}
                disabled={briefing || !desc}
                title={!desc ? 'No description available' : undefined}
              >
                {briefing
                  ? (brief ? 'Regenerating…' : 'Generating…')
                  : (brief ? 'Regenerate brief' : 'Generate job brief')}
              </button>
            </div>

            {briefError && <p className="brief-error">{briefError}</p>}

            {brief ? (
              <>
                <BriefView brief={brief} />
                {desc && (
                  <details
                    className="raw-desc-details"
                    open={rawExpanded}
                    onToggle={e => setRawExpanded((e.target as HTMLDetailsElement).open)}
                  >
                    <summary className="raw-desc-summary">Raw LinkedIn description</summary>
                    <p className="panel-desc raw-desc-text">{desc}</p>
                  </details>
                )}
              </>
            ) : desc ? (
              <>
                <p className="panel-desc">
                  {desc.length > PREVIEW_LEN && !rawExpanded
                    ? desc.slice(0, PREVIEW_LEN) + '…'
                    : desc}
                </p>
                {desc.length > PREVIEW_LEN && (
                  <button
                    className="panel-toggle"
                    onClick={() => setRawExpanded(x => !x)}
                  >
                    {rawExpanded ? 'Show less' : 'Show full description'}
                  </button>
                )}
              </>
            ) : (
              <p className="panel-empty">No description available.</p>
            )}
          </section>

          {/* Notes */}
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
