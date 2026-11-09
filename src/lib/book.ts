import { computed, reactive } from 'vue'
import { strToU8, zipSync } from 'fflate'
import { save } from '@tauri-apps/plugin-dialog'
import { getDefaultExportDir } from '@/utils/exportDir'
import type { ArchiveItem, Book, BookMeta, Chapter, ExportKind, Volume } from './types'
import { parseBook, serializeBook, toPlainText } from './md'
import { countWords, uid } from './text'
import {
  exists,
  joinPath,
  listDir,
  mkdir,
  normalizePath,
  pickFile,
  readText,
  removePath,
  writeBytes,
  writeText
} from './storage'
import { importAsBook, library, safeName, scanLibrary } from './library'
import { confirmBox, promptBox, toast } from './ui' // ★ 新增 promptBox

export const app = reactive({
  book: null as Book | null,
  activeChapterId: '',
  dirty: false,
  saving: false,
  savedAt: 0,
  rev: 0,
  words: {} as Record<string, number>
})

export const archives = reactive({
  items: [] as ArchiveItem[],
  dir: ''
})

const ARCH_DIR = '.archives'
let saveTimer: ReturnType<typeof setTimeout> | null = null

/* ------------------------- 打开 / 关闭 ------------------------- */

export async function openBook(meta: BookMeta | { dir: string }) {
  const dir = normalizePath(meta.dir)
  const file = joinPath(dir, 'book.md')
  if (!(await exists(file))) {
    toast('这个文件夹里没有 book.md')
    return
  }
  const text = await readText(file)
  const parsed = parseBook(text, dir.split('/').pop() || '未命名')
  parsed.dir = dir
  parsed.file = file
  attach(parsed)
  localStorage.setItem('mw.lastDir', dir)
  await refreshArchives()
  toast('已打开《' + parsed.title + '》')
}

export async function openLastBook(): Promise<boolean> {
  const last = localStorage.getItem('mw.lastDir')
  if (!last) return false
  if (!(await exists(joinPath(last, 'book.md')))) return false
  const text = await readText(joinPath(last, 'book.md'))
  const parsed = parseBook(text, normalizePath(last).split('/').pop() || '未命名')
  parsed.dir = normalizePath(last)
  parsed.file = joinPath(last, 'book.md')
  attach(parsed)
  await refreshArchives()
  return true
}

function attach(book: Book) {
  app.book = book
  app.words = {}
  for (const v of book.volumes) for (const c of v.chapters) app.words[c.id] = countWords(c.content)
  const saved = localStorage.getItem('mw.chapter:' + book.dir)
  const pick = findChapter(saved || '') ? saved! : book.volumes[0]?.chapters[0]?.id || ''
  app.activeChapterId = pick
  app.dirty = false
}

export function closeBook() {
  app.book = null
  app.activeChapterId = ''
  app.words = {}
  archives.items = []
  localStorage.removeItem('mw.lastDir')
}

/* ------------------------- 派生 ------------------------- */

export function findChapter(id: string): Chapter | null {
  for (const v of app.book?.volumes || []) {
    const c = v.chapters.find((x) => x.id === id)
    if (c) return c
  }
  return null
}

export function findVolumeOf(id: string): Volume | null {
  for (const v of app.book?.volumes || []) {
    if (v.chapters.some((c) => c.id === id)) return v
  }
  return null
}

export const currentChapter = computed<Chapter | null>(() => {
  const b = app.book
  if (!b) return null
  return findChapter(app.activeChapterId)
})

export const currentVolume = computed<Volume | null>(() => findVolumeOf(app.activeChapterId))

export function countOf(id: string): number {
  if (app.words[id] === undefined) {
    const c = findChapter(id)
    return c ? countWords(c.content) : 0
  }
  return app.words[id]
}

export const totalWords = computed(() => {
  const b = app.book
  if (!b) return 0
  let n = 0
  for (const v of b.volumes) for (const c of v.chapters) n += countOf(c.id)
  return n
})

/* ------------------------- 编辑 ------------------------- */

export function selectChapter(id: string) {
  app.activeChapterId = id
  if (app.book) localStorage.setItem('mw.chapter:' + app.book.dir, id)
}

export function setContent(id: string, md: string) {
  const c = findChapter(id)
  if (!c) return
  c.content = md
  app.words[id] = countWords(md)
  scheduleSave()
}

/* ------------------------- 保存 ------------------------- */

export function scheduleSave() {
  app.dirty = true
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 900)
}

export async function saveNow(silent = true) {
  const b = app.book
  if (!b || !b.file) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  app.saving = true
  try {
    await writeText(b.file, serializeBook(b))
    app.dirty = false
    app.savedAt = Date.now()
    if (!silent) toast('已保存到 book.md')
  } catch (e: any) {
    toast('保存失败：' + (e?.message || e))
  } finally {
    app.saving = false
  }
}

/* ------------------------- 结构操作 ------------------------- */

function stampNow(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

export function cnNum(n: number): string {
  const nums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  if (n <= 10) return nums[n]
  if (n < 20) return '十' + nums[n - 10]
  if (n < 100) {
    const t = Math.floor(n / 10)
    const r = n % 10
    return nums[t] + '十' + (r ? nums[r] : '')
  }
  return String(n)
}

export function addVolume(title?: string) {
  const b = app.book
  if (!b) return
  const ch: Chapter = { id: uid(), title: '第一章', content: '' }
  const v: Volume = {
    id: uid(),
    title: title || `第${cnNum(b.volumes.length + 1)}卷`,
    chapters: [ch]
  }
  app.words[ch.id] = 0
  b.volumes.push(v)
  selectChapter(ch.id)
  scheduleSave()
  toast('已新增分卷')
}

export function addChapter(volId?: string, title?: string) {
  const b = app.book
  if (!b) return
  const vol = b.volumes.find((v) => v.id === volId) || currentVolume.value || b.volumes[0]
  if (!vol) return
  const ch: Chapter = {
    id: uid(),
    title: title || `第${cnNum(vol.chapters.length + 1)}章`,
    content: ''
  }
  app.words[ch.id] = 0
  vol.chapters.push(ch)
  selectChapter(ch.id)
  scheduleSave()
  toast('已新增章节')
}

export function renameVolume(v: Volume, name: string) {
  v.title = name
  scheduleSave()
}

export function renameChapter(c: Chapter, name: string) {
  c.title = name
  scheduleSave()
}

export function renameBookTitle(name: string) {
  if (!app.book) return
  app.book.title = name
  scheduleSave()
}

export function deleteChapter(volId: string, chapterId: string) {
  const b = app.book
  if (!b) return
  const vol = b.volumes.find((v) => v.id === volId)
  if (!vol) return
  const idx = vol.chapters.findIndex((c) => c.id === chapterId)
  if (idx < 0) return
  vol.chapters.splice(idx, 1)
  delete app.words[chapterId]
  if (app.activeChapterId === chapterId) {
    const next =
      vol.chapters[Math.min(idx, vol.chapters.length - 1)] ||
      b.volumes.flatMap((v) => v.chapters)[0]
    app.activeChapterId = next ? next.id : ''
  }
  scheduleSave()
}

export function deleteVolume(volId: string) {
  const b = app.book
  if (!b) return
  const vol = b.volumes.find((v) => v.id === volId)
  if (!vol) return
  b.volumes = b.volumes.filter((v) => v.id !== volId)
  vol.chapters.forEach((c) => delete app.words[c.id])
  if (vol.chapters.some((c) => c.id === app.activeChapterId)) {
    app.activeChapterId = b.volumes[0]?.chapters[0]?.id || ''
  }
  scheduleSave()
}

export function moveChapter(volId: string, chapterId: string, targetVolId: string, targetIndex: number) {
  const b = app.book
  if (!b) return
  const from = b.volumes.find((v) => v.id === volId)
  const to = b.volumes.find((v) => v.id === targetVolId)
  if (!from || !to) return
  const i = from.chapters.findIndex((c) => c.id === chapterId)
  if (i < 0) return
  const [ch] = from.chapters.splice(i, 1)
  let idx = targetIndex
  if (from.id === to.id && i < targetIndex) idx--
  idx = Math.max(0, Math.min(idx, to.chapters.length))
  to.chapters.splice(idx, 0, ch)
  scheduleSave()
}

export function moveVolume(fromIndex: number, toIndex: number) {
  const b = app.book
  if (!b) return
  if (fromIndex < 0 || fromIndex >= b.volumes.length) return
  const [v] = b.volumes.splice(fromIndex, 1)
  let idx = toIndex
  if (fromIndex < toIndex) idx--
  idx = Math.max(0, Math.min(idx, b.volumes.length))
  b.volumes.splice(idx, 0, v)
  scheduleSave()
}

/* ------------------------- 设定集与替换 ------------------------- */

// ★ 切换设定集卷
export function toggleSettingVolume(vol: Volume) {
  vol.isSetting = !vol.isSetting
  scheduleSave()
  toast(vol.isSetting ? '已设为设定集卷' : '已取消设定集')
}

// ★ 全书替换（跳过设定集卷）
export async function replaceInBook() {
  const b = app.book
  if (!b) return
  
  const findStr = await promptBox('全书替换', '', '请输入要查找的词')
  if (!findStr) return
  const replaceStr = await promptBox('全书替换', '', `将「${findStr}」替换为：`)
  if (replaceStr === null) return // 允许替换为空

  let count = 0
  // 遍历所有卷
  for (const v of b.volumes) {
    if (v.isSetting) continue // ★ 跳过设定集
    for (const c of v.chapters) {
      const oldContent = c.content
      // 全局替换（转义正则特殊字符）
      const regex = new RegExp(findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      c.content = c.content.replace(regex, replaceStr)
      if (c.content !== oldContent) {
        count++
        app.words[c.id] = countWords(c.content)
      }
    }
  }
  
  if (count > 0) {
    app.rev++ // 触发编辑器重绘
    scheduleSave()
    toast(`替换完成，涉及 ${count} 个章节`)
  } else {
    toast('未找到匹配内容')
  }
}

/* ------------------------- 存档 ------------------------- */

function archDirOf(book: Book): string {
  return joinPath(book.dir, ARCH_DIR)
}

export async function refreshArchives() {
  const b = app.book
  archives.items = []
  if (!b) return
  archives.dir = archDirOf(b)
  try {
    if (!(await exists(archives.dir))) return
    const list = await listDir(archives.dir)
    const items: ArchiveItem[] = []
    for (const e of list) {
      if (e.is_dir || !e.name.toLowerCase().endsWith('.md')) continue
      const m = e.name.match(/(auto|manual)-(\d{8})-(\d{6})\.md/i)
      const kind = (m?.[1]?.toLowerCase() === 'manual' ? 'manual' : 'auto') as 'auto' | 'manual'
      const stamp = m
        ? `${m[2].slice(4, 6)}-${m[2].slice(6, 8)} ${m[3].slice(0, 2)}:${m[3].slice(2, 4)}`
        : e.name
      items.push({ name: e.name, path: e.path, kind, stamp })
    }
    items.sort((a, b2) => b2.name.localeCompare(a.name))
    archives.items = items
  } catch {
    /* ignore */
  }
}

async function writeArchive(kind: 'auto' | 'manual'): Promise<boolean> {
  const b = app.book
  if (!b) return false
  const dir = archDirOf(b)
  await mkdir(dir)
  const path = joinPath(dir, `${kind}-${stampNow()}.md`)
  await writeText(path, serializeBook(b))
  return true
}

export async function autoArchive() {
  if (!app.book || !app.dirty) return
  await saveNow()
  if (!(await writeArchive('auto'))) return
  await refreshArchives()
  const autos = archives.items.filter((i) => i.kind === 'auto')
  for (const old of autos.slice(5)) await removePath(old.path)
  await refreshArchives()
}

export async function manualArchive(): Promise<void> {
  const b = app.book
  if (!b) return
  await saveNow()
  await writeArchive('manual')
  const autos = archives.items.filter((i) => i.kind === 'auto')
  for (const a of autos) await removePath(a.path)
  await refreshArchives()
  toast('已手动存档，之前的自动存档已清除')
}

export async function restoreArchive(item: ArchiveItem) {
  const b = app.book
  if (!b) return
  const ok = await confirmBox('恢复存档', `恢复到 ${item.stamp} 的版本？当前内容会先自动存一份。`, true)
  if (!ok) return
  await writeArchive('auto')
  const text = await readText(item.path)
  const parsed = parseBook(text, b.title)
  b.title = parsed.title || b.title
  b.author = parsed.author || b.author
  b.volumes = parsed.volumes
  app.words = {}
  for (const v of b.volumes) for (const c of v.chapters) app.words[c.id] = countWords(c.content)
  app.activeChapterId = b.volumes[0]?.chapters[0]?.id || ''
  app.rev++
  await saveNow()
  await refreshArchives()
  toast('已恢复')
}

export async function deleteArchive(item: ArchiveItem) {
  await removePath(item.path)
  await refreshArchives()
}

/* ------------------------- 导入 / 导出 ------------------------- */

export async function pickAndImport() {
  const file = await pickFile()
  if (!file) return
  
  const text = await readText(file)
  const guess = file.split('/').pop()?.replace(/\.(md|markdown|txt)$/i, '') || '未命名'
  const preview = parseBook(text, guess)
  
  const total = preview.volumes.reduce((n, v) => n + v.chapters.length, 0)
  const ok = await confirmBox(
    '导入书稿',
    `识别到《${preview.title}》共 ${preview.volumes.length} 卷、${total} 章。\n导入后会作为一本新书出现在书库根目录里，保留原有分卷 / 章节结构。`
  )
  if (!ok) return
  
  const meta = await importAsBook(text, guess)
  if (!meta) {
    toast('导入失败')
    return
  }
  await openBook(meta)
  await scanRefresh()
  toast('导入完成')
}

export async function scanRefresh() {
  library.books = await scanLibrary(library.root)
}

export async function exportBook(kind: ExportKind) {
  const b = app.book
  if (!b) return
  try {
    await doExport(b, kind)
  } catch (e: any) {
    toast('导出失败：' + (e?.message || e))
  }
}

async function doExport(b: Book, kind: ExportKind) {
  await saveNow()
  const stem = safeName(b.title)
  const ext = `.${kind}`
  
  const defaultDir = await getDefaultExportDir()
  let defaultPath = stem + ext
  if (defaultDir && !/android|iphone|ipad/i.test(navigator.userAgent)) {
    const sep = defaultDir.includes('\\') ? '\\' : '/'
    defaultPath = defaultDir.replace(/[\\/]$/, '') + sep + stem + ext
  }

  const path = await save({
    defaultPath: defaultPath,
    filters: [{ name: kind.toUpperCase(), extensions: [kind] }]
  })

  if (!path) return 

  // ★ 核心：导出前的数据过滤
  const exportBookData = { ...b }
  if (kind === 'txt') {
    // txt 剔除设定集卷
    exportBookData.volumes = b.volumes.filter(v => !v.isSetting)
  }

  if (kind === 'md') {
    await writeText(path, serializeBook(b)) // MD 全保留
  } else if (kind === 'txt') {
    await writeText(path, toPlainText(exportBookData)) // TXT 用过滤后的
  } else {
    const files: Record<string, Uint8Array> = {}
    files[`${stem}.md`] = strToU8(serializeBook(b))
    files[`${stem}.txt`] = strToU8(toPlainText(exportBookData))
    files['book.json'] = strToU8(
      JSON.stringify(
        {
          title: b.title,
          author: b.author,
          volumes: b.volumes.map((v) => ({
            title: v.title,
            isSetting: v.isSetting, // ★ 记住设定集状态
            chapters: v.chapters.map((c) => ({ title: c.title, content: c.content }))
          }))
        },
        null,
        2
      )
    )
    b.volumes.forEach((v, vi) => {
      v.chapters.forEach((c, ci) => {
        const d = `${String(vi + 1).padStart(3, '0')}-${safeName(v.title)}`
        const n = `${String(ci + 1).padStart(3, '0')}-${safeName(c.title)}.md`
        files[`章节/${d}/${n}`] = strToU8(c.content || '')
      })
    })
    await writeBytes(path, zipSync(files, { level: 6 }))
  }
  
  toast(`已成功导出`)
}