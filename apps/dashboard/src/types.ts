export type JobStatus =
  | 'saved'
  | 'applied'
  | 'rejected'
  | 'oa'
  | 'interview'
  | 'offer'
  | 'archived'

export type WritableStatus = 'saved' | 'applied' | 'interview' | 'archived'

export type Verdict =
  | 'strong_apply'
  | 'apply'
  | 'apply_as_stretch'
  | 'apply_only_if'
  | 'maybe'
  | 'skip'
  | 'hard_skip'

export interface FitAnalysis {
  id: number
  job_id: number
  verdict: Verdict
  fit_score: number
  role_type: string | null
  seniority_estimate: string | null
  company_type: string | null
  salary_signal: string
  career_upside: string | null
  learning_upside: string | null
  technical_depth: string | null
  why: string | null
  pros_json: string[] | string
  cons_json: string[] | string
  risks_json: string[] | string
  missing_skills_json: string[] | string
  matching_strengths_json: string[] | string
  prep_topics_json: string[] | string
  cv_keywords_to_highlight_json: string[] | string
  recommended_action: string | null
  created_at: string
}

export interface Job {
  id: number
  source: string
  external_job_id: string | null
  title: string
  company: string
  location: string | null
  url: string | null
  description: string | null
  status: JobStatus
  saved_at: string | null
  applied_at: string | null
  analyzed_at: string | null
  notes: string | null
  role_type: string | null
  salary_min: number | null
  salary_max: number | null
  created_at: string
  updated_at: string
  latest_analysis: FitAnalysis | null
}

// Column definitions for the board
export interface BoardColumn {
  id: string
  label: string
  statuses: JobStatus[]
}

export const BOARD_COLUMNS: BoardColumn[] = [
  { id: 'saved',     label: 'Saved',     statuses: ['saved'] },
  { id: 'applied',   label: 'Applied',   statuses: ['applied'] },
  { id: 'interview', label: 'Interview', statuses: ['oa', 'interview', 'offer'] },
  { id: 'archived',  label: 'Archived',  statuses: ['archived', 'rejected'] },
]

export const WRITABLE_STATUSES: { value: WritableStatus; label: string }[] = [
  { value: 'saved',     label: 'Saved' },
  { value: 'applied',   label: 'Applied' },
  { value: 'interview', label: 'Interview' },
  { value: 'archived',  label: 'Archived' },
]

export interface UserProfile {
  id: number
  target_roles: string[]
  target_contract: string | null
  preferred_locations: string[]
  minimum_salary_eur: number | null
  happy_salary_eur: number | null
  strategy: string | null
  preferred_stacks: string[]
  target_keywords: string[]
  avoid_keywords: string[]
  current_experience_summary: string | null
  career_goals: string | null
  red_flags: string[]
  decision_style: string | null
  updated_at: string | null
}

export interface UserProfileUpdate {
  target_roles?: string[]
  target_contract?: string | null
  preferred_locations?: string[]
  minimum_salary_eur?: number | null
  happy_salary_eur?: number | null
  strategy?: string | null
  preferred_stacks?: string[]
  target_keywords?: string[]
  avoid_keywords?: string[]
  current_experience_summary?: string | null
  career_goals?: string | null
  red_flags?: string[]
  decision_style?: string | null
}
