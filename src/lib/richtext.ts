/**
 * 轻量 Markdown ⇄ Tiptap 文档转换。
 * 只覆盖小说写作真正会用到的格式：段落、加粗、斜体、删除线、代码、
 * 有序/无序列表、引用、分割线、硬换行。不引入额外依赖，转换稳定可逆。
 */

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** 行内 Markdown → HTML */
export function inlineToHtml(text: string): string {
  let s = escapeHtml(text)
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>')
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
  s = s.replace(/\n/g, '<br>')
  return s
}

/** 多行 Markdown → HTML（每个非空行 = 一个段落，符合中文小说习惯） */
export function mdToHtml(md: string): string {
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let quote: string[] = []

  const flushList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }
  const flushQuote = () => {
    if (quote.length) {
      out.push(
        '<blockquote><p>' + quote.map(inlineToHtml).join('<br>') + '</p></blockquote>'
      )
      quote = []
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const trimmed = line.trim()

    if (!trimmed) {
      flushList()
      flushQuote()
      continue
    }
    if (/^>\s?/.test(trimmed)) {
      flushList()
      quote.push(trimmed.replace(/^>\s?/, ''))
      continue
    }
    if (/^(\*\*\*|----|___)$/.test(trimmed)) {
      flushList()
      flushQuote()
      out.push('<hr>')
      continue
    }
    const ul = trimmed.match(/^[-*+]\s+(.*)$/)
    const ol = trimmed.match(/^\d+[.)]\s+(.*)$/)
    if (ul || ol) {
      flushQuote()
      const want = ul ? 'ul' : 'ol'
      if (list !== want) {
        flushList()
        out.push(`<${want}>`)
        list = want
      }
      out.push(`<li><p>${inlineToHtml((ul || ol)![1])}</p></li>`)
      continue
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      flushList()
      flushQuote()
      out.push(`<p>${inlineToHtml(trimmed.replace(/^#{1,6}\s+/, ''))}</p>`)
      continue
    }
    flushList()
    flushQuote()
    out.push(`<p>${inlineToHtml(line)}</p>`)
  }
  flushList()
  flushQuote()
  return out.join('') || '<p></p>'
}

interface Node {
  type: string
  text?: string
  content?: Node[]
  marks?: { type: string; attrs?: Record<string, unknown>; [k: string]: unknown }[]
  attrs?: Record<string, unknown>
}

function inlineToMd(node: Node): string {
  if (node.type === 'hardBreak') return '<br>'
  if (node.type !== 'text' || !node.text) return ''
  let s = node.text
  for (const m of node.marks || []) {
    if (m.type === 'bold') s = `**${s}**`
    else if (m.type === 'italic') s = `*${s}*`
    else if (m.type === 'strike') s = `~~${s}~~`
    else if (m.type === 'code') s = `\`${s}\``
  }
  return s
}

function blockToMd(node: Node): string {
  switch (node.type) {
    case 'paragraph':
      return (node.content || []).map(inlineToMd).join('')
    case 'heading': {
      const level = (node.attrs?.level as number) || 1
      return '#'.repeat(Math.min(6, level)) + ' ' + (node.content || []).map(inlineToMd).join('')
    }
    case 'bulletList':
      return (node.content || [])
        .map((li) => '- ' + childrenOf(li).join(' '))
        .join('\n')
    case 'orderedList':
      return (node.content || [])
        .map((li, i) => `${i + 1}. ` + childrenOf(li).join(' '))
        .join('\n')
    case 'blockquote':
      return (node.content || [])
        .map((c) => childrenOf(c).join(' '))
        .map((t) => '> ' + t)
        .join('\n')
    case 'codeBlock':
      return '```\n' + (node.content || []).map((c) => c.text || '').join('\n') + '\n```'
    case 'horizontalRule':
      return '***'
    default:
      return childrenOf(node).join(' ')
  }
}

function childrenOf(node: Node): string[] {
  return (node.content || []).map((c) => (c.type === 'paragraph' ? blockToMd(c) : blockToMd(c)))
}

/** Tiptap 文档 JSON → Markdown */
export function docToMd(doc: Node): string {
  return (doc.content || [])
    .map(blockToMd)
    .filter((s) => s.trim() !== '')
    .join('\n\n')
}

export function plainTextOf(doc: Node): string {
  let s = ''
  const walk = (n: Node) => {
    if (n.text) s += n.text
    if (n.type === 'paragraph' || n.type === 'heading') s += '\n'
    ;(n.content || []).forEach(walk)
  }
  walk(doc)
  return s
}
