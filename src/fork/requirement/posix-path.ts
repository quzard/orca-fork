// 渲染进程不能用 node:path。这里只处理 POSIX 路径，测试和预览都在这个约定下。

export function posixIsAbsolute(path: string): boolean {
  return path.startsWith('/')
}

export function posixBasename(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const slash = trimmed.lastIndexOf('/')
  return slash !== -1 ? trimmed.slice(slash + 1) : trimmed
}

export function posixJoin(...parts: string[]): string {
  const absolute = parts[0]?.startsWith('/') === true
  const stack: string[] = []
  for (const part of parts.join('/').split('/')) {
    if (!part || part === '.') {
      continue
    }
    if (part === '..') {
      stack.pop()
      continue
    }
    stack.push(part)
  }
  return `${absolute ? '/' : ''}${stack.join('/')}`
}

export function posixResolve(...parts: string[]): string {
  let absolute = false
  const stack: string[] = []
  for (const part of parts) {
    if (!part) {
      continue
    }
    if (part.startsWith('/')) {
      absolute = true
      stack.length = 0
    }
    for (const segment of part.split('/')) {
      if (!segment || segment === '.') {
        continue
      }
      if (segment === '..') {
        stack.pop()
        continue
      }
      stack.push(segment)
    }
  }
  return `${absolute ? '/' : ''}${stack.join('/')}`
}

export function posixRelative(from: string, to: string): string {
  const left = posixResolve(from).split('/').filter(Boolean)
  const right = posixResolve(to).split('/').filter(Boolean)
  let shared = 0
  while (shared < left.length && shared < right.length && left[shared] === right[shared]) {
    shared += 1
  }
  const up = left.slice(shared).map(() => '..')
  return [...up, ...right.slice(shared)].join('/')
}
