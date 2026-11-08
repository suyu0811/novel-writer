import type { Book, Chapter, Volume } from './types'
import { uid } from './text'

/**
 * 书稿文件格式（book.md）——纯 Markdown，任何编辑器都能打开：
 *
 * ---
 * title: 书名
 * author: 作者
 * ---
 *
 * # 第一卷 卷名
 *
 * ## 第一章 章名
 *
 * 正文……
 */

function yamlValue(v: string): string {
  if (!v) return "''"
  if (/[:#\-?&*!|>'"%@`{}\[\],]/.test(v) || /^\s|\s$/.test(v)) {
    return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  }
  return v
}

function unyaml(v: string): string {
  let s = v.trim()
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return s
}

export function serializeBook(book: Book): string {
  const head = [
    '---',
    `title: ${yamlValue(book.title)}`,
    `author: ${yamlValue(book.author || '')}`,
    `updated: ${new Date().toISOString()}`,
    '---',
    ''
  ].join('\n')

  const chunks: string[] = [head]
  for (const vol of book.volumes) {
    chunks.push(`# ${vol.title}`.trimEnd(), '')
    for (const ch of vol.chapters) {
      chunks.push(`## ${ch.title}`.trimEnd(), '')
      const body = ch.content.replace(/\r\n/g, '\n').trim()
      if (body) chunks.push(body, '')
    }
  }
  return chunks.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

interface RawHead {
  level: number
  title: string
  line: number
}

const HEAD_RE = /^(#{1,6})[ \t]+(.*\S)[ \t]*$/

function splitFrontMatter(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const meta: Record<string, string> = {}
  if (!normalized.startsWith('---\n')) return { meta, body: normalized }

  const end = normalized.indexOf('\n---', 4)
  if (end === -1) return { meta, body: normalized }

  const block = normalized.slice(4, end)
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/)
    if (m) meta[m[1].toLowerCase()] = unyaml(m[2])
  }
  const rest = normalized.slice(end + 4).replace(/^\n+/, '')
  return { meta, body: rest }
}

/**
 * 解析任意 Markdown / TXT：自动识别「卷 / 章」层级。
 * 兼容网文平台导出的 txt、自己手写的 md、本 App 导出的 book.md。
 */
export function parseBook(text: string, fallbackTitle = '未命名书稿'): Book {
  const { meta, body } = splitFrontMatter(text)
  const lines = body.split('\n')

  const heads: RawHead[] = []
  lines.forEach((line, i) => {
    const m = line.match(HEAD_RE)
    if (m) heads.push({ level: m[1].length, title: m[2].trim(), line: i })
  })

  let bookTitle = (meta.title || '').trim() || fallbackTitle
  const author = (meta.author || '').trim()

  const mkBook = (volumes: Volume[]): Book => ({
    dir: '',
    file: '',
    title: bookTitle,
    author,
    volumes
  })

  // 完全没有标题：整篇当作一本书的「正文」
  if (heads.length === 0) {
    const only = body.trim()
    return mkBook([
      {
        id: uid(),
        title: '第一卷',
        chapters: [{ id: uid(), title: '正文', content: only }]
      }
    ])
  }

  const levels = [...new Set(heads.map((h) => h.level))].sort((a, b) => a - b)
  const volumeLevel = levels[0]
  const chapterLevel = levels.find((l) => l > volumeLevel)

  // 只有一个层级：这些标题都是章节，统一放进「第一卷」
  if (chapterLevel === undefined) {
    const chapters: Chapter[] = []
    heads.forEach((h, idx) => {
      const next = idx + 1 < heads.length ? heads[idx + 1].line : lines.length
      chapters.push({
        id: uid(),
        title: h.title,
        content: lines.slice(h.line + 1, next).join('\n').trim()
      })
    })
    const preface = lines.slice(0, heads[0].line).join('\n').trim()
    if (preface) chapters.unshift({ id: uid(), title: '序章', content: preface })
    return mkBook([{ id: uid(), title: '第一卷', chapters }])
  }

  // 首个大标题常常就是书名（"# 书名" + "# 第一卷" 的写法），剥掉它
  let firstHeadIdx = 0
  if (
    heads.length > 1 &&
    heads[0].level === volumeLevel &&
    heads[0].title !== bookTitle &&
    lines.slice(0, heads[0].line).join('').trim() === '' &&
    lines.slice(heads[0].line + 1, heads[1].line).join('').trim() === ''
  ) {
    const anyChild = heads.slice(1).some((h) => h.level === chapterLevel)
    if (anyChild && (!meta.title || heads[0].title === bookTitle)) {
      firstHeadIdx = 1
      bookTitle = heads[0].title
    }
  }

  const volumes: Volume[] = []
  const volHeads = heads
    .map((h, i) => ({ h, i }))
    .filter((x) => x.h.level === volumeLevel && x.i >= firstHeadIdx)

  // 开头不属于任何卷的散文字段
  const prefaceEnd = volHeads.length ? volHeads[0].h.line : lines.length
  const prefaceStart = firstHeadIdx === 1 ? heads[0].line + 1 : 0
  const preface = lines.slice(prefaceStart, prefaceEnd).join('\n').trim()

  volHeads.forEach((vh, vi) => {
    const volEnd =
      vi + 1 < volHeads.length ? volHeads[vi + 1].h.line : lines.length
    const childHeads = heads
      .map((h, i) => ({ h, i }))
      .filter(
        (x) =>
          x.i > vh.i &&
          x.h.line > vh.h.line &&
          x.h.line < volEnd &&
          x.h.level === chapterLevel
      )

    const chapters: Chapter[] = []
    childHeads.forEach((ch, ci) => {
      const next =
        ci + 1 < childHeads.length ? childHeads[ci + 1].h.line : volEnd
      chapters.push({
        id: uid(),
        title: ch.h.title,
        content: lines.slice(ch.h.line + 1, next).join('\n').trim()
      })
    })

    // 卷里没有章标题，但有一段正文 → 收成一章
    if (chapters.length === 0) {
      const start = childHeads.length ? childHeads[0].h.line : vh.h.line
      const volBody = lines.slice(start + 1, volEnd).join('\n').trim()
      chapters.push({ id: uid(), title: '正文', content: volBody })
    }

    volumes.push({ id: uid(), title: vh.h.title, chapters })
  })

  if (preface) {
    volumes.unshift({
      id: uid(),
      title: '序',
      chapters: [{ id: uid(), title: '序章', content: preface }]
    })
  }

  if (volumes.length === 0) {
    volumes.push({
      id: uid(),
      title: '第一卷',
      chapters: [{ id: uid(), title: '正文', content: body.trim() }]
    })
  }

  return mkBook(volumes)
}

/** 导出纯文本（txt）：卷名 / 章名按常见网文格式排版 */
export function toPlainText(book: Book): string {
  const out: string[] = [book.title]
  if (book.author) out.push(`作者：${book.author}`)
  out.push('')
  for (const vol of book.volumes) {
    out.push(vol.title, '')
    for (const ch of vol.chapters) {
      out.push(ch.title, '')
      const plain = stripInline(ch.content)
      if (plain.trim()) out.push(plain.trim(), '')
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

function stripInline(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
}
