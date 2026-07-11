import { useState, useEffect } from 'react'
import type { ChangeEvent } from 'react'
import type { UserProfile, UserProfileUpdate } from '../types'
import { getProfile, updateProfile } from '../api'

interface Props {
  onClose: () => void
}

interface Draft {
  target_roles: string
  target_contract: string
  preferred_locations: string
  minimum_salary_eur: string
  happy_salary_eur: string
  strategy: string
  preferred_stacks: string
  target_keywords: string
  avoid_keywords: string
  current_experience_summary: string
  career_goals: string
  red_flags: string
  decision_style: string
}

const EMPTY_DRAFT: Draft = {
  target_roles: '',
  target_contract: '',
  preferred_locations: '',
  minimum_salary_eur: '',
  happy_salary_eur: '',
  strategy: '',
  preferred_stacks: '',
  target_keywords: '',
  avoid_keywords: '',
  current_experience_summary: '',
  career_goals: '',
  red_flags: '',
  decision_style: '',
}

function toLines(arr: string[]): string {
  return arr.join('\n')
}

function toArray(text: string): string[] {
  return text.split('\n').map(s => s.trim()).filter(Boolean)
}

function profileToDraft(p: UserProfile): Draft {
  return {
    target_roles:               toLines(p.target_roles),
    target_contract:            p.target_contract ?? '',
    preferred_locations:        toLines(p.preferred_locations),
    minimum_salary_eur:         p.minimum_salary_eur != null ? String(p.minimum_salary_eur) : '',
    happy_salary_eur:           p.happy_salary_eur != null ? String(p.happy_salary_eur) : '',
    strategy:                   p.strategy ?? '',
    preferred_stacks:           toLines(p.preferred_stacks),
    target_keywords:            toLines(p.target_keywords),
    avoid_keywords:             toLines(p.avoid_keywords),
    current_experience_summary: p.current_experience_summary ?? '',
    career_goals:               p.career_goals ?? '',
    red_flags:                  toLines(p.red_flags),
    decision_style:             p.decision_style ?? '',
  }
}

function draftToUpdate(d: Draft): UserProfileUpdate {
  const parseSalary = (s: string) => s.trim() !== '' ? parseInt(s, 10) : null
  return {
    target_roles:               toArray(d.target_roles),
    target_contract:            d.target_contract.trim() || null,
    preferred_locations:        toArray(d.preferred_locations),
    minimum_salary_eur:         parseSalary(d.minimum_salary_eur),
    happy_salary_eur:           parseSalary(d.happy_salary_eur),
    strategy:                   d.strategy.trim() || null,
    preferred_stacks:           toArray(d.preferred_stacks),
    target_keywords:            toArray(d.target_keywords),
    avoid_keywords:             toArray(d.avoid_keywords),
    current_experience_summary: d.current_experience_summary.trim() || null,
    career_goals:               d.career_goals.trim() || null,
    red_flags:                  toArray(d.red_flags),
    decision_style:             d.decision_style.trim() || null,
  }
}

function isProfileEmpty(p: UserProfile): boolean {
  return (
    p.target_roles.length === 0 &&
    !p.strategy &&
    !p.current_experience_summary &&
    !p.career_goals
  )
}

export default function ProfileModal({ onClose }: Props) {
  const [loading,   setLoading]   = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft,     setDraft]     = useState<Draft>(EMPTY_DRAFT)
  const [empty,     setEmpty]     = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState<'saved' | 'error' | null>(null)

  useEffect(() => {
    getProfile()
      .then(p => {
        setDraft(profileToDraft(p))
        setEmpty(isProfileEmpty(p))
      })
      .catch(() => setLoadError('Could not load profile. Is the backend running on localhost:8000?'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function field(key: keyof Draft) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(prev => ({ ...prev, [key]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveMsg(null)
    try {
      await updateProfile(draftToUpdate(draft))
      setEmpty(false)
      setSaveMsg('saved')
      setTimeout(() => setSaveMsg(null), 2500)
    } catch {
      setSaveMsg('error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>

        <div className="panel-header">
          <div className="panel-header-text">
            <h2 className="panel-title">Career Profile</h2>
            <span className="panel-company">Used by AI analysis to judge job fit</span>
          </div>
          <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="panel-body">

          {loading && (
            <p className="panel-empty" style={{ padding: '20px 0' }}>Loading…</p>
          )}

          {loadError && (
            <p className="profile-load-error">{loadError}</p>
          )}

          {!loading && !loadError && (
            <>
              {empty && (
                <div className="profile-empty-state">
                  Your profile is empty. Configure it so AI analysis can judge jobs against your actual goals.
                </div>
              )}

              {/* Target Roles */}
              <section className="panel-section">
                <label className="panel-label">Target Roles</label>

                <div className="profile-field">
                  <label className="profile-field-label">Roles you're looking for</label>
                  <textarea
                    className="profile-textarea"
                    rows={3}
                    placeholder={"AI Engineer\nBackend Engineer\nData Engineer"}
                    value={draft.target_roles}
                    onChange={field('target_roles')}
                  />
                  <span className="profile-hint">One per line</span>
                </div>

                <div className="profile-field">
                  <label className="profile-field-label">Contract type</label>
                  <input
                    className="profile-input"
                    type="text"
                    placeholder="e.g. CDI, Permanent, Freelance"
                    value={draft.target_contract}
                    onChange={field('target_contract')}
                  />
                </div>

                <div className="profile-field">
                  <label className="profile-field-label">Preferred locations</label>
                  <textarea
                    className="profile-textarea"
                    rows={2}
                    placeholder={"Paris\nRemote"}
                    value={draft.preferred_locations}
                    onChange={field('preferred_locations')}
                  />
                  <span className="profile-hint">One per line</span>
                </div>
              </section>

              {/* Salary */}
              <section className="panel-section">
                <label className="panel-label">Salary (EUR / year)</label>
                <div className="profile-salary-row">
                  <div className="profile-field">
                    <label className="profile-field-label">Minimum acceptable</label>
                    <input
                      className="profile-input"
                      type="number"
                      placeholder="50000"
                      min={0}
                      value={draft.minimum_salary_eur}
                      onChange={field('minimum_salary_eur')}
                    />
                  </div>
                  <div className="profile-field">
                    <label className="profile-field-label">Happy with</label>
                    <input
                      className="profile-input"
                      type="number"
                      placeholder="70000"
                      min={0}
                      value={draft.happy_salary_eur}
                      onChange={field('happy_salary_eur')}
                    />
                  </div>
                </div>
              </section>

              {/* Tech & Keywords */}
              <section className="panel-section">
                <label className="panel-label">Tech & Keywords</label>

                <div className="profile-field">
                  <label className="profile-field-label">Preferred stacks</label>
                  <textarea
                    className="profile-textarea"
                    rows={3}
                    placeholder={"Python\nFastAPI\nPostgreSQL\nRAG"}
                    value={draft.preferred_stacks}
                    onChange={field('preferred_stacks')}
                  />
                  <span className="profile-hint">One per line</span>
                </div>

                <div className="profile-field">
                  <label className="profile-field-label">Target keywords</label>
                  <textarea
                    className="profile-textarea"
                    rows={3}
                    placeholder={"founding\nLLM\nAI Engineer\ndata pipeline"}
                    value={draft.target_keywords}
                    onChange={field('target_keywords')}
                  />
                  <span className="profile-hint">Keywords that signal a good fit — one per line</span>
                </div>

                <div className="profile-field">
                  <label className="profile-field-label">Avoid keywords</label>
                  <textarea
                    className="profile-textarea"
                    rows={3}
                    placeholder={"consulting\nESN\nmanaged services"}
                    value={draft.avoid_keywords}
                    onChange={field('avoid_keywords')}
                  />
                  <span className="profile-hint">Red flags in job descriptions — one per line</span>
                </div>
              </section>

              {/* Background */}
              <section className="panel-section">
                <label className="panel-label">Background</label>

                <div className="profile-field">
                  <label className="profile-field-label">Current experience summary</label>
                  <textarea
                    className="profile-textarea"
                    rows={5}
                    placeholder="Brief summary of your current role, skills, and experience level…"
                    value={draft.current_experience_summary}
                    onChange={field('current_experience_summary')}
                  />
                </div>

                <div className="profile-field">
                  <label className="profile-field-label">Career goals</label>
                  <textarea
                    className="profile-textarea"
                    rows={3}
                    placeholder="What you're optimising for in your next role…"
                    value={draft.career_goals}
                    onChange={field('career_goals')}
                  />
                </div>

                <div className="profile-field">
                  <label className="profile-field-label">Job search strategy</label>
                  <textarea
                    className="profile-textarea"
                    rows={3}
                    placeholder="Overall strategy — what you're prioritising and why…"
                    value={draft.strategy}
                    onChange={field('strategy')}
                  />
                </div>
              </section>

              {/* Preferences */}
              <section className="panel-section">
                <label className="panel-label">Preferences</label>

                <div className="profile-field">
                  <label className="profile-field-label">Red flags</label>
                  <textarea
                    className="profile-textarea"
                    rows={3}
                    placeholder={"No equity\nLarge legacy codebase\nNo engineering culture"}
                    value={draft.red_flags}
                    onChange={field('red_flags')}
                  />
                  <span className="profile-hint">One per line</span>
                </div>

                <div className="profile-field">
                  <label className="profile-field-label">Decision style</label>
                  <input
                    className="profile-input"
                    type="text"
                    placeholder="e.g. Risk-averse, Opportunity-seeker, Mission-driven"
                    value={draft.decision_style}
                    onChange={field('decision_style')}
                  />
                </div>
              </section>

              {/* Save */}
              <section className="panel-section">
                <div className="notes-save-row">
                  <button
                    className="btn-save-notes"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? 'Saving…' : 'Save profile'}
                  </button>
                  {saveMsg === 'saved' && (
                    <span className="notes-msg notes-msg-ok">Profile saved</span>
                  )}
                  {saveMsg === 'error' && (
                    <span className="notes-msg notes-msg-err">Failed to save — check the backend</span>
                  )}
                </div>
              </section>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
