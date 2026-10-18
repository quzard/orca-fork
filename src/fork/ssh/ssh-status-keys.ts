// fork: i18n keys for SSH connection status names, by upstream status. A const list, not template
// literals, so fork-keys-catalog.fork.test.ts can check every key has en and zh.
export const SSH_STATUS_KEYS: Readonly<Record<string, string>> = {
  disconnected: 'sshConnectionStatus.disconnected',
  connecting: 'sshConnectionStatus.connecting',
  'auth-failed': 'sshConnectionStatus.authFailed',
  'deploying-relay': 'sshConnectionStatus.deployingRelay',
  connected: 'sshConnectionStatus.connected',
  reconnecting: 'sshConnectionStatus.reconnecting',
  'reconnection-failed': 'sshConnectionStatus.reconnectionFailed'
}
