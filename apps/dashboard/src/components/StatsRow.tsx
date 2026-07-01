import type { Job } from '../types'

interface Props {
  jobs: Job[]
}

export default function StatsRow({ jobs }: Props) {
  const total     = jobs.length
  const saved     = jobs.filter(j => j.status === 'saved').length
  const applied   = jobs.filter(j => j.status === 'applied').length
  const interview = jobs.filter(j => ['oa', 'interview', 'offer'].includes(j.status)).length
  const analyzed  = jobs.filter(j => j.latest_analysis !== null).length

  return (
    <div className="stats-row">
      <Stat label="Total"     value={total} />
      <Stat label="Saved"     value={saved} />
      <Stat label="Applied"   value={applied} />
      <Stat label="Interview" value={interview} />
      <Stat label="Analyzed"  value={analyzed} accent />
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? 'stat-accent' : ''}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
