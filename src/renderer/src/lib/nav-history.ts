const SKIP_PREFIX = ['/login', '/setup', '/print']

let stack: string[] = []

function skip(path: string): boolean {
  return SKIP_PREFIX.some((p) => path === p || path.startsWith(`${p}/`))
}

export function pushNavHistory(path: string): void {
  if (!path || skip(path)) return
  if (stack[stack.length - 1] === path) return
  stack.push(path)
  if (stack.length > 80) stack = stack.slice(-80)
}

export function previousNavPath(): string | null {
  if (stack.length < 2) return null
  return stack[stack.length - 2] ?? null
}

/** Drop the current page and return the path to go back to. */
export function popNavHistory(): string | null {
  if (stack.length < 2) return null
  stack.pop()
  return stack[stack.length - 1] ?? null
}

/** Test helper. */
export function resetNavHistory(paths: string[] = []): void {
  stack = [...paths]
}
