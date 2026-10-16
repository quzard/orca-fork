// fork: SSH / 受管目录浏览的条目修正。未注册时保留上游的目录判断。

export type RemoteDirectoryEntry = {
  name: string
  isDirectory: boolean
  isSymlink?: boolean
}

export type RemoteDirectoryListingHook = (
  entries: readonly RemoteDirectoryEntry[],
  directoryPath: string
) => readonly RemoteDirectoryEntry[] | Promise<readonly RemoteDirectoryEntry[]>

// fork: 未登记时返回 undefined，调用方保留上游命令。登记后只替换 cd 之后的后半段。
let listingHook: RemoteDirectoryListingHook | undefined
let posixBrowseTail: string | undefined

export function registerRemoteDirectoryListingHook(next: RemoteDirectoryListingHook): void {
  listingHook = next
}

export function registerPosixBrowseCommandTail(command: string): void {
  posixBrowseTail = command
}

export function resolvePosixBrowseCommandTail(): string | undefined {
  return posixBrowseTail
}

export function getRemoteDirectoryListingHook(): RemoteDirectoryListingHook | undefined {
  return listingHook
}
