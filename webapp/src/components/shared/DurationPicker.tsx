import type { DurationType } from '../../types'
import { getDurationLabel } from '../../lib/relationships'

const DURATIONS: DurationType[] = ['1_day', '1_week']

interface DurationPickerProps {
  value: DurationType | null
  onChange: (d: DurationType) => void
}

export function DurationPicker({ value, onChange }: DurationPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {DURATIONS.map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            value === d
              ? 'bg-red-600 border-red-600 text-white'
              : 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:border-neutral-500'
          }`}
        >
          {getDurationLabel(d)}
        </button>
      ))}
    </div>
  )
}
