import { useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import type { Job, WritableStatus } from '../types'
import { BOARD_COLUMNS } from '../types'
import Column from './Column'
import JobCard from './JobCard'

interface Props {
  jobs: Job[]
  selectedId: number | null
  onSelect: (id: number) => void
  onStatusChange: (id: number, status: WritableStatus) => void
}

export default function Board({ jobs, selectedId, onSelect, onStatusChange }: Props) {
  const [activeJob, setActiveJob] = useState<Job | null>(null)

  // Require 8px pointer movement before a drag starts.
  // Below this threshold the interaction is treated as a normal click,
  // so clicking a card to open the detail panel keeps working.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  function handleDragStart({ active }: DragStartEvent) {
    setActiveJob(jobs.find(j => j.id === active.id) ?? null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveJob(null)
    if (!over) return

    const job = jobs.find(j => j.id === active.id)
    if (!job) return

    const targetCol = over.id as WritableStatus

    // Map the job's current status to its column.
    // Handles aliased statuses: oa/offer → interview, rejected → archived.
    const currentCol = BOARD_COLUMNS.find(c => c.statuses.includes(job.status))?.id
    if (targetCol === currentCol) return // dropped on the same column — no-op

    onStatusChange(job.id, targetCol)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="board">
        {BOARD_COLUMNS.map(col => {
          const colJobs = jobs.filter(j => col.statuses.includes(j.status))
          return (
            <Column
              key={col.id}
              column={col}
              jobs={colJobs}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          )
        })}
      </div>

      {/* Floating card that follows the cursor while dragging.
          dropAnimation={null} makes the card snap away instantly on drop
          rather than animating back, which feels more responsive. */}
      <DragOverlay dropAnimation={null}>
        {activeJob && (
          <JobCard
            job={activeJob}
            selected={false}
            onClick={() => {}}
            overlay
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}
