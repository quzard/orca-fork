import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { forkTranslate } from '../i18n/fork-translate'

export function CompareTargetPicker({
  current,
  onCommit
}: {
  current: string | null
  onCommit: (ref: string | null) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(current ?? '')
  useEffect(() => {
    setDraft(current ?? '')
  }, [current])
  return (
    <div className="flex items-center gap-1 px-2 pb-1">
      <Input
        density="compact"
        value={draft}
        placeholder={forkTranslate('fork.sourceControl.compare.placeholder', 'origin/main')}
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={() => onCommit(draft.trim() ? draft.trim() : null)}
      >
        {forkTranslate('fork.sourceControl.compare.change', 'Use')}
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={() => onCommit(null)}>
        {forkTranslate('fork.sourceControl.compare.clear', 'Clear')}
      </Button>
    </div>
  )
}
