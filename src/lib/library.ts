import { reactive } from 'vue'
import type { BookMeta } from './types'
import {
  baseName,
  defaultRoot,
  exists,
  joinPath,
  listDir,
  mkdir,
  normalizePath,
  readHead,
  readText,
  removePath,
  renamePath,
  writeText
} from './storage'
import { saveSettings, settings } from './settings'
import { confirmBox, promptBox, toast } from './ui'
import { parseBook, serializeBook } from './md'
import { uid } from './text'

export const library = reactive({
  root: '',
  books: [] as BookMeta[],
  ready: false
})

const orderKey = (root: string) => 'mw.order:' + normalizePath(root)

export function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名'
}

/** 存储根目录：用户在设置里指定过就用它，否则用系统文档目录 */
export async function ensureRoot(): Promise<string> {
  if (!settings.rootDir) {
    const d = await defaultRoot()
    settings.rootDir = d || ''
    saveSettings()
  }
  library.root = settings.rootDir
  return library.root
}

function titleFromHead(head: string, fallback: string): { title: string; author: string } {
  const t = head.match(/^\s*title\s*:\s*(.*)$/m)
  const a = head.match(/^\s*author\s*:\s*(.*)$/m)
  const clean = (v?: string) =>
    (v || '').trim().replace(/^["']|["']$/g, '').replace(/\\"/g, '"')
  return {
    title: clean(t?.[1]) || fallback,
    author: clean(a?.[1])
  }
}

/** 扫描根目录下所有含 book.md 的子文件夹 */
export async function scanLibrary(root?: string): Promise<BookMeta[]> {
  const base = root || (await ensureRoot())
  if (!base) return []
  const list: BookMeta[] = []
  try {
    await mkdir(base)
    const entries = await listDir(base)
    for (const e of entries) {
      if (!e.is_dir) continue
      const file = joinPath(e.path, 'book.md')
      if (!(await exists(file))) continue
      let title = baseName(e.path)
      let author = ''
      try {
        const head = await readHead(file, 400)
        const info = titleFromHead(head, title)
        title = info.title
        author = info.author
      } catch {
        /* 用文件夹名兜底 */
      }
      list.push({ dir: normalizePath(e.path), title, author, kind: 'book' })
    }
  } catch {
    /* ignore */
  }
  return applyOrder(base, list)
}

function applyOrder(root: string, list: BookMeta[]): BookMeta[] {
  let order: string[] = []
  try {
    order = JSON.parse(localStorage.getItem(orderKey(root)) || '[]')
  } catch {
    order = []
  }
  if (!order.length) return list
  const rank = (d: string) => {
    const i = order.indexOf(normalizePath(d))
    return i === -1 ? 9999 : i
  }
  return list.slice().sort((a, b) => rank(a.dir) - rank(b.dir))
}

function persistOrder(root: string, books: BookMeta[]) {
  localStorage.setItem(orderKey(root), JSON.stringify(books.map((b) => b.dir)))
}

export async function loadLibrary(forceRoot?: string) {
  if (forceRoot) {
    settings.rootDir = forceRoot
    saveSettings()
  }
  await ensureRoot()
  library.books = await scanLibrary(library.root)
  library.ready = true
}

/** 新建一本（在根目录里建同名文件夹 + book.md） */
export async function createBook(title: string): Promise<BookMeta | null> {
  const root = await ensureRoot()
  if (!root) {
    toast('还没有可用的存储目录')
    return null
  }
  let name = safeName(title)
  let dir = joinPath(root, name)
  let n = 2
  while (await exists(dir)) {
    name = `${safeName(title)} ${n++}`
    dir = joinPath(root, name)
  }
  await mkdir(dir)
  const book = {
    dir: '',
    file: joinPath(dir, 'book.md'),
    title: name,
    author: '',
    volumes: [
      {
        id: uid(),
        title: '第一卷',
        chapters: [{ id: uid(), title: '第一章', content: '' }]
      }
    ]
  }
  await writeText(book.file, serializeBook(book))
  library.books = await scanLibrary(root)
  persistOrder(root, library.books)
  return library.books.find((b) => normalizePath(b.dir) === normalizePath(dir)) || null
}

/** 长按菜单：重命名书籍（同时改文件夹名和 book.md 里的书名） */
export async function renameBook(meta: BookMeta): Promise<string | null> {
  const name = await promptBox('重命名书籍', meta.title, '书名会同步写入 book.md，文件夹也会一起改名')
  if (!name || !name.trim()) return null
  const newName = safeName(name.trim())
  const root = await ensureRoot()
  const oldDir = normalizePath(meta.dir)
  const newDir = joinPath(root, newName)

  if (normalizePath(newDir) !== oldDir && (await exists(newDir))) {
    toast('已有同名书籍了')
    return null
  }
  try {
    if (normalizePath(newDir) !== oldDir) {
      await renamePath(oldDir, newDir)
    }
    const text = await readText(joinPath(newDir, 'book.md'))
    const parsed = parseBook(text, newName)
    parsed.title = newName
    await writeText(joinPath(newDir, 'book.md'), serializeBook(parsed))
    // 修正排序里的路径
    const order: string[] = JSON.parse(localStorage.getItem(orderKey(root)) || '[]')
    localStorage.setItem(
      orderKey(root),
      JSON.stringify(order.map((d) => (normalizePath(d) === oldDir ? normalizePath(newDir) : d)))
    )
    if (localStorage.getItem('mw.lastDir') === oldDir) {
      localStorage.setItem('mw.lastDir', normalizePath(newDir))
    }
  } catch (e: any) {
    toast('重命名失败：' + (e?.message || e))
    return null
  }
  await loadLibrary()
  toast('已重命名')
  return normalizePath(newDir)
}

export async function deleteBook(meta: BookMeta) {
  const ok = await confirmBox(
    '删除书籍',
    `《${meta.title}》整个文件夹（含 book.md）都会被删除，不可恢复。\n建议先「手动存档」或导出备份。`,
    true
  )
  if (!ok) return
  try {
    await removePath(meta.dir)
    if (normalizePath(localStorage.getItem('mw.lastDir') || '') === normalizePath(meta.dir)) {
      localStorage.removeItem('mw.lastDir')
    }
  } catch (e: any) {
    toast('删除失败：' + (e?.message || e))
    return
  }
  await loadLibrary()
  toast('已删除')
}

/** 列表里上下移动 */
export async function moveBook(meta: BookMeta, delta: number) {
  const books = library.books
  const i = books.findIndex((b) => normalizePath(b.dir) === normalizePath(meta.dir))
  if (i < 0) return
  const j = i + delta
  if (j < 0 || j >= books.length) {
    toast(delta < 0 ? '已经是最上面了' : '已经是最下面了')
    return
  }
  const [item] = books.splice(i, 1)
  books.splice(j, 0, item)
  persistOrder(library.root, books)
}

/** 把外部 md / txt 导入成一本新书 */
export async function importAsBook(text: string, guessTitle: string): Promise<BookMeta | null> {
  const root = await ensureRoot()
  const parsed = parseBook(text, guessTitle)
  let name = safeName(parsed.title || guessTitle)
  let dir = joinPath(root, name)
  let n = 2
  while (await exists(dir)) {
    name = `${safeName(parsed.title || guessTitle)} ${n++}`
    dir = joinPath(root, name)
  }
  await mkdir(dir)
  parsed.title = name
  await writeText(joinPath(dir, 'book.md'), serializeBook(parsed))
  await loadLibrary()
  return library.books.find((b) => normalizePath(b.dir) === normalizePath(dir)) || null
}
