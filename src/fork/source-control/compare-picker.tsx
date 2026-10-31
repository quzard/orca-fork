import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { forkTranslate } from '../i18n/fork-translate'

export function CompareTargetPicker({
  current,
  onCommit
}: {
  current: string | null
  onCommit: (ref: string | null) => Promise<void>
}): React.JSX.Element {
  const [draft, setDraft] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    setDraft(current ?? '')
  }, [current])
  // 主机拒绝时草稿留在输入框里，并说明原因，不把还没写上的目标显示成已保存。
  const commit = (ref: string | null): void => {
    setSaving(true)
    setError(null)
    onCommit(ref).then(
      () => setSaving(false),
      (reason: unknown) => {
        setSaving(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    )
  }
  const label = forkTranslate('fork.sourceControl.compare.label', 'Compare target')
  return (
    <div className="px-2 pb-1">
      <div className="flex items-center gap-1">
        <Input
          density="compact"
          value={draft}
          aria-label={label}
          title={label}
          placeholder={forkTranslate('fork.sourceControl.compare.placeholder', 'origin/main')}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={saving}
          onClick={() => commit(draft.trim() ? draft.trim() : null)}
        >
          {forkTranslate('fork.sourceControl.compare.change', 'Use')}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          disabled={saving}
          onClick={() => commit(null)}
        >
          {forkTranslate('fork.sourceControl.compare.clear', 'Clear')}
        </Button>
      </div>
      {error ? (
        <p className="pt-0.5 text-xs text-destructive" role="alert">
          {forkTranslate(
            'fork.sourceControl.compare.saveFailed',
            "Couldn't save the compare target: {{error}}",
            { error }
          )}
        </p>
      ) : null}
    </div>
  )
}
