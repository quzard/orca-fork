// fork: i18n keys for the workspace context menu's Sleep and Delete labels. A const list, not
// template literals, so fork-keys-catalog.fork.test.ts can check every key has en and zh.
export const CONTEXT_MENU_LABEL_KEYS = {
  sleep: 'fork.sidebar.contextMenu.sleep',
  sleepOne: 'fork.sidebar.contextMenu.sleepOne',
  sleepMany: 'fork.sidebar.contextMenu.sleepMany',
  deleteSelected: 'fork.sidebar.contextMenu.deleteSelected',
  deleteOne: 'fork.sidebar.contextMenu.deleteOne',
  deleteMany: 'fork.sidebar.contextMenu.deleteMany'
} as const
