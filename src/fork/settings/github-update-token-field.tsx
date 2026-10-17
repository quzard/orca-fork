// fork: 设置里的 GitHub token。已保存的值不读回输入框。
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSetting } from '@/components/settings/SearchableSetting'
import {
  FORK_GITHUB_TOKEN_FIELD_TITLE,
  FORK_GITHUB_UPDATE_TOKEN_HINT,
  FORK_GITHUB_UPDATE_TOKEN_SAVED
} from '../../shared/fork-hooks/update-feed'

const SAVE_LABEL = 'Save'
const CLEAR_LABEL = 'Clear'
const SAVE_FAILED = 'Could not save the GitHub token.'

export function GithubUpdateTokenField(): React.JSX.Element | null {
  const readStatus = window.api.updater.getForkGithubTokenStatus
  const writeToken = window.api.updater.setForkGithubToken
  const [configured, setConfigured] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!readStatus) {
      return
    }
    let active = true
    void readStatus().then(
      (status) => {
        if (active) {
          setConfigured(status.configured)
        }
      },
      () => {
        if (active) {
          setConfigured(false)
        }
      }
    )
    return () => {
      active = false
    }
  }, [readStatus])

  if (!readStatus || !writeToken) {
    return null
  }

  const save = (token: string): void => {
    setBusy(true)
    void writeToken(token).then(
      (status) => {
        setConfigured(status.configured)
        setDraft('')
        setBusy(false)
      },
      () => {
        toast.error(SAVE_FAILED)
        setBusy(false)
      }
    )
  }

  return (
    <SearchableSetting
      title={FORK_GITHUB_TOKEN_FIELD_TITLE}
      description={FORK_GITHUB_UPDATE_TOKEN_HINT}
      keywords={['github', 'token', 'update', 'quzard']}
      className="space-y-2"
    >
      <Label htmlFor="fork-github-update-token">{FORK_GITHUB_TOKEN_FIELD_TITLE}</Label>
      <p className="text-xs text-muted-foreground">
        {configured ? FORK_GITHUB_UPDATE_TOKEN_SAVED : FORK_GITHUB_UPDATE_TOKEN_HINT}
      </p>
      <div className="flex gap-2">
        <Input
          id="fork-github-update-token"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || draft.trim().length === 0}
          onClick={() => save(draft.trim())}
        >
          {SAVE_LABEL}
        </Button>
        {configured ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => save('')}
          >
            {CLEAR_LABEL}
          </Button>
        ) : null}
      </div>
    </SearchableSetting>
  )
}
