import { ipcRenderer } from 'electron'
import {
  FORK_GITHUB_UPDATE_TOKEN_SET_CHANNEL,
  FORK_GITHUB_UPDATE_TOKEN_STATUS_CHANNEL
} from '../../shared/fork-hooks/update-feed'
import type { UpdateStatus } from '../../shared/update-status-types'
import { prepareAndInvokeUpdaterInstall } from '../renderer-restart-wiring'
import { awaitBeforeUnloadCheckpoint, updaterQuitAbortRelay } from '../preload-runtime-support'
import type { PreloadApi } from '../api-types'

export const updaterApi = {
  getStatus: () => ipcRenderer.invoke('updater:getStatus'),
  getVersion: () => ipcRenderer.invoke('updater:getVersion'),
  check: (options) => ipcRenderer.invoke('updater:check', options),
  download: () => ipcRenderer.invoke('updater:download'),
  dismissNudge: () => ipcRenderer.invoke('updater:dismissNudge'),
  dismissAvailableUpdate: () => ipcRenderer.invoke('updater:dismissAvailableUpdate'),
  getLinuxPackageInstallInstructions: () =>
    ipcRenderer.invoke('updater:getLinuxPackageInstallInstructions'),
  showLinuxPackage: () => ipcRenderer.invoke('updater:showLinuxPackage'),
  listBuilds: (channel, options) => ipcRenderer.invoke('updater:listBuilds', channel, options),
  quitAndInstall: (): Promise<void> =>
    prepareAndInvokeUpdaterInstall(
      window,
      updaterQuitAbortRelay,
      () => ipcRenderer.invoke('updater:quitAndInstall'),
      awaitBeforeUnloadCheckpoint
    ),

  onStatus: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => callback(status)
    ipcRenderer.on('updater:status', listener)
    return () => ipcRenderer.removeListener('updater:status', listener)
  },
  onClearDismissal: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent) => callback()
    ipcRenderer.on('updater:clearDismissal', listener)
    return () => ipcRenderer.removeListener('updater:clearDismissal', listener)
  },
  getForkGithubTokenStatus: () => ipcRenderer.invoke(FORK_GITHUB_UPDATE_TOKEN_STATUS_CHANNEL),
  setForkGithubToken: (token) => ipcRenderer.invoke(FORK_GITHUB_UPDATE_TOKEN_SET_CHANNEL, token)
} satisfies PreloadApi['updater']
