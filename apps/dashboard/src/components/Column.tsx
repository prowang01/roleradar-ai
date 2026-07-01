import { useDroppable } from '@dnd-kit/core'
import type { Job, BoardColumn } from '../types'
import JobCard from './JobCard'

interface Props {
  column: BoardColumn
  jobs: Job[]
  selectedId: number | null
  onSelect: (id: number) => void
}

export default function Column({ column, jobs, selectedId, onSelect }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <div className="column">
      <div className="column-header">
        <span className="column-title">{column.label}</span>
        <span className="column-count">{jobs.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`column-cards${isOver ? ' column-over' : ''}`}
      >
        {jobs.length === 0 && (
          <div className="column-empty">Drop here</div>
        )}
        {jobs.map(job => (
          <JobCard
            key={job.id}
            job={job}
            selected={job.id === selectedId}
            onClick={() => onSelect(job.id)}
          />
        ))}
      </div>
    </div>
  )
}
