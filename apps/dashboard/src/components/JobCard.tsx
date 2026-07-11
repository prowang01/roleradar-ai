import { useDraggable } from '@dnd-kit/core'
import type { Job, Verdict, JobStatus } from '../types'

interface Props {
  job: Job
  selected: boolean
  onClick: () => void
  overlay?: boolean
}

// Maps a job's backend status to its visual column accent colour class.
function accentClass(status: JobStatus): string {
  if (status === 'saved') return 'accent-saved'
  if (status === 'applied') return 'accent-applied'
  if (status === 'oa' || status === 'interview' || status === 'offer') return 'accent-interview'
  return 'accent-archived'
}

export default function JobCard({ job, selected, onClick, overlay = false }: Props) {
  // When rendering inside DragOverlay (overlay=true), disable the draggable
  // behaviour — the overlay is a pure visual clone, not an interactive element.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: job.id,
    disabled: overlay,
  })

  const a = job.latest_analysis

  const cls = [
    'job-card',
    accentClass(job.status),
    selected             ? 'job-card-selected' : '',
    isDragging && !overlay ? 'is-dragging'      : '',
    overlay              ? 'is-overlay'         : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={setNodeRef}
      {...listeners}   // pointer events that drive the drag gesture
      {...attributes}  // aria-* attributes and role/tabIndex
      className={cls}
      onClick={onClick}
      onKeyDown={e => e.key === 'Enter' && onClick()}
    >
      <div className="job-card-top">
        <span className="job-card-title" title={job.title}>{job.title}</span>
        <StatusBadge status={job.status} />
      </div>

      <span className="job-card-company">{job.company}</span>

      {job.location && (
        <span className="job-card-location">{job.location}</span>
      )}

      {a && (
        <div className="job-card-analysis">
          <VerdictBadge verdict={a.verdict} />
          <span className="job-card-score">
            {a.fit_score.toFixed(1)}
            <span className="job-card-score-denom">/10</span>
          </span>
        </div>
      )}
    </div>
  )
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const labels: Record<Verdict, string> = {
    strong_apply:    'Strong Apply',
    apply:           'Apply',
    apply_as_stretch: 'Stretch Apply',
    apply_only_if:   'Apply If',
    maybe:           'Maybe',
    skip:            'Skip',
    hard_skip:       'Hard Skip',
  }
  return <span className={`verdict-badge verdict-${verdict}`}>{labels[verdict]}</span>
}

function StatusBadge({ status }: { status: JobStatus }) {
  const overrides: Partial<Record<JobStatus, string>> = {
    offer:    'Offer',
    rejected: 'Rejected',
    oa:       'OA',
  }
  const label = overrides[status]
  if (!label) return null
  return <span className={`status-badge status-${status}`}>{label}</span>
}
