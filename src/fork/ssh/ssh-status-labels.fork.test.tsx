import { afterAll, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import { STATUS_LABELS } from '../../renderer/src/components/settings/SshTargetCard'
import { installForkLocaleOverlays } from '../i18n/locale-overlay'
import { withForkSshStatusLabels } from './ssh-status-labels'

describe('SSH connection status labels', () => {
  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('keeps upstream English, and translates on read after a language switch', async () => {
    installForkLocaleOverlays(i18n)
    await i18n.changeLanguage('en')
    expect(STATUS_LABELS['auth-failed']).toBe('Auth failed')
    expect(STATUS_LABELS['deploying-relay']).toBe('Deploying relay\u2026')
    await i18n.changeLanguage('zh')
    expect(STATUS_LABELS.connected).toBe('已连接')
    expect(STATUS_LABELS['reconnection-failed']).toBe('重新连接失败')
  })

  it('leaves getters and unknown keys alone', () => {
    let reads = 0
    const labels = withForkSshStatusLabels({
      other: 'Other',
      get error() {
        reads++
        return 'Error'
      }
    })
    expect(reads).toBe(0)
    expect(labels.other).toBe('Other')
    expect(labels.error).toBe('Error')
  })
})
