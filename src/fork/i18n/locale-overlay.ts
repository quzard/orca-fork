// fork: translations for strings the fork adds. Upstream's locale files stay untouched; the
// overlay fills only keys a loaded catalog does not have, so an upstream translation wins.
import type { i18n as I18nInstance } from 'i18next'
import zh from './zh.json'

const NAMESPACE = 'translation'

export const FORK_LOCALE_OVERLAYS: Readonly<Record<string, Record<string, unknown>>> = { zh }

/**
 * Merges each overlay into its language as soon as that catalog lands. Catalogs load lazily, so
 * this listens to the store instead of seeding a bundle, which would stop the real one loading.
 */
export function installForkLocaleOverlays(
  i18n: I18nInstance,
  overlays: Readonly<Record<string, Record<string, unknown>>> = FORK_LOCALE_OVERLAYS
): void {
  let merging = false
  const merge = (language: string, namespace: string): void => {
    const overlay = overlays[language]
    if (merging || namespace !== NAMESPACE || !overlay) {
      return
    }
    merging = true
    try {
      // deep = true, overwrite = false: only missing keys are added.
      i18n.addResourceBundle(language, NAMESPACE, overlay, true, false)
    } finally {
      merging = false
    }
  }
  i18n.store.on('added', merge)
  for (const language of Object.keys(overlays)) {
    if (i18n.hasResourceBundle(language, NAMESPACE)) {
      merge(language, NAMESPACE)
    }
  }
}
