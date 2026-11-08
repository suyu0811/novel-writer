import { invoke } from '@tauri-apps/api/core'

/** 是否运行在 Tauri 容器内（浏览器预览时为 false） */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export interface DirEntry {
  name: string
  path: string
  is_dir: boolean
}

/* ---------------- 路径工具 ---------------- */

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
}

export function joinPath(base: string, ...rest: string[]): string {
  const parts = [normalizePath(base), ...rest.map((r) => r.replace(/^\/+|\/+$/g, ''))]
  return parts.filter(Boolean).join('/')
}

export function baseName(p: string): string {
  const n = normalizePath(p).split('/').pop() || p
  return n.replace(/\.(md|txt|zip)$/i, '')
}

export function fileStem(p: string): string {
  const n = normalizePath(p).split('/').pop() || p
  const i = n.lastIndexOf('.')
  return i > 0 ? n.slice(0, i) : n
}

export function dirName(p: string): string {
  const n = normalizePath(p)
  const i = n.lastIndexOf('/')
  return i === -1 ? n : n.slice(0, i)
}

/* ---------------- 文件读写（Rust 命令，无作用域限制） ---------------- */

const LS = (k: string) => 'mw:' + k

export async function readText(path: string): Promise<string> {
  if (isTauri()) return invoke<string>('fs_read_text', { path })
  return localStorage.getItem(LS(path)) ?? ''
}

/** 只读文件头若干字节，用于快速取书名，避免整本读取 */
export async function readHead(path: string, bytes = 400): Promise<string> {
  if (isTauri()) return invoke<string>('fs_read_head', { path, bytes })
  return (localStorage.getItem(LS(path)) ?? '').slice(0, bytes)
}

export async function writeText(path: string, content: string): Promise<void> {
  if (isTauri()) return invoke('fs_write_text', { path, content })
  localStorage.setItem(LS(path), content)
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  if (isTauri()) {
    return invoke('fs_write_bytes', { path, bytes: Array.from(bytes) })
  }
  const blob = new Blob([bytes as BlobPart], { type: 'application/zip' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fileStem(path) + '.zip'
  a.click()
  URL.revokeObjectURL(a.href)
}

export async function exists(path: string): Promise<boolean> {
  if (isTauri()) return invoke<boolean>('fs_exists', { path })
  const key = LS(path)
  if (localStorage.getItem(key) !== null) return true
  // 目录本身没有键，只要下面有文件就算存在
  const prefix = key + '/'
  for (let i = 0; i < localStorage.length; i++) {
    if ((localStorage.key(i) || '').startsWith(prefix)) return true
  }
  return false
}

export async function mkdir(path: string): Promise<void> {
  if (isTauri()) return invoke('fs_mkdir', { path })
}

export async function listDir(path: string): Promise<DirEntry[]> {
  if (isTauri()) return invoke<DirEntry[]>('fs_list', { path })
  // 浏览器预览：从 localStorage 的键里反推出目录与文件
  const out: DirEntry[] = []
  const base = normalizePath(path)
  const dirs = new Set<string>()
  const files = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || ''
    if (!k.startsWith(LS(base) + '/')) continue
    const full = k.slice(3)
    const rest = full.slice(base.length + 1)
    if (!rest) continue
    const segs = rest.split('/')
    if (segs.length > 1) dirs.add(base + '/' + segs[0])
    else files.add(full)
  }
  for (const d of dirs) out.push({ name: d.split('/').pop() || d, path: d, is_dir: true })
  for (const f of files) out.push({ name: f.split('/').pop() || f, path: f, is_dir: false })
  return out
}

export async function removePath(path: string): Promise<void> {
  if (isTauri()) return invoke('fs_remove', { path })
  const key = LS(path)
  if (localStorage.getItem(key) !== null) {
    localStorage.removeItem(key)
    return
  }
  // 目录：只删这个目录下的键，前缀必须带斜杠，避免「乙」误删「乙改」
  const prefix = key + '/'
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || ''
    if (k.startsWith(prefix)) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}

export async function renamePath(from: string, to: string): Promise<void> {
  if (isTauri()) return invoke('fs_rename', { from, to })
  const fromKey = LS(from)
  const toKey = LS(to)
  const moves: [string, string][] = []
  const prefix = fromKey + '/'
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || ''
    if (k.startsWith(prefix)) moves.push([k, toKey + k.slice(fromKey.length)])
    else if (k === fromKey) moves.push([k, toKey])
  }
  for (const [a, b] of moves) {
    const v = localStorage.getItem(a) ?? ''
    localStorage.setItem(b, v)
    localStorage.removeItem(a)
  }
}

/* ---------------- 对话框 ---------------- */

export async function pickFolder(title = '选择文件夹'): Promise<string | null> {
  if (!isTauri()) return 'browser://本地预览'
  const { open } = await import('@tauri-apps/plugin-dialog')
  const res = await open({ directory: true, multiple: false, title })
  return typeof res === 'string' ? res : null
}

export async function pickFile(): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  const res = await open({
    multiple: false,
    title: '选择要导入的书稿',
    filters: [{ name: '书籍文件', extensions: ['md', 'markdown', 'txt'] }]
  })
  return typeof res === 'string' ? res : null
}

export async function pickSavePath(defaultName: string, ext: string): Promise<string | null> {
  if (!isTauri()) return `browser://${defaultName}.${ext}`
  const { save } = await import('@tauri-apps/plugin-dialog')
  const res = await save({
    defaultPath: `${defaultName}.${ext}`,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
  })
  return typeof res === 'string' ? res : null
}

/** 默认书稿根目录：桌面端「文档/墨匣小说」，安卓为 App 私有文档目录 */
export async function defaultRoot(): Promise<string> {
  if (!isTauri()) return 'browser:/墨匣小说'
  try {
    return await invoke<string>('default_book_root')
  } catch {
    return ''
  }
}

export async function appVersion(): Promise<string> {
  if (!isTauri()) return '1.0.0'
  try {
    return await invoke<string>('app_version')
  } catch {
    return '1.0.0'
  }
}
