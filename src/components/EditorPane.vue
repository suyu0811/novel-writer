<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  app,
  countOf,
  currentChapter,
  findChapter,
  renameChapter,
  setContent,
  totalWords
} from '../lib/book'
import { docToMd, mdToHtml } from '../lib/richtext'
import { promptBox, toast } from '../lib/ui'
import { settings, saveSettings } from '../lib/settings' // ★ 引入 saveSettings 用于关掉视觉缩进

const editor = shallowRef<Editor | null>(null)
const tick = ref(0)
const mountEl = ref<HTMLElement | null>(null)
let internal = false

const extensions = [
  StarterKit.configure({
    heading: false,
    codeBlock: false,
    code: false,
    horizontalRule: {}
  }),
  Placeholder.configure({ placeholder: '从这里开始写……' })
]

function build(html: string) {
  editor.value?.destroy()
  const el = mountEl.value
  if (!el) return
  editor.value = new Editor({
    element: el,
    content: html,
    extensions,
    editorProps: {
      attributes: {
        class: 'ProseMirror',
        spellcheck: 'false',
        autocorrect: 'off',
        autocapitalize: 'off'
      }
    },
    onUpdate: ({ editor: ed }) => {
      if (internal) return
      const id = app.activeChapterId
      if (id) setContent(id, docToMd(ed.getJSON() as any))
    },
    onTransaction: () => {
      tick.value++
    }
  })
}

onMounted(() => {
  if (mountEl.value) {
    const ch = findChapter(app.activeChapterId)
    build(ch ? mdToHtml(ch.content) : '<p></p>')
  }
  
  // 启动时应用本地字体
  const fontData = localStorage.getItem('custom_font_data')
  const fontName = localStorage.getItem('custom_font_name')
  if (fontData && fontName) {
    try {
      const font = new FontFace(fontName, `url(${fontData})`)
      font.load().then((loaded) => {
        document.fonts.add(loaded)
        document.documentElement.style.setProperty('--editor-custom-font', `"${fontName}", system-ui`)
      })
    } catch (e) { console.error(e) }
  }
})

onBeforeUnmount(() => {
  editor.value?.destroy()
  editor.value = null
})

watch(
  [mountEl, () => app.activeChapterId, () => app.rev],
  ([el, id]) => {
    if (!el) return
    internal = true
    const ch = findChapter(id)
    build(ch ? mdToHtml(ch.content) : '<p></p>')
    internal = false
  },
  { flush: 'post' }
)

const chWords = computed(() => (app.activeChapterId ? countOf(app.activeChapterId) : 0))
const allWords = computed(() => totalWords.value)

const isEmpty = computed(() => {
  tick.value
  return editor.value ? editor.value.isEmpty : true
})

function run(fn: (e: Editor) => void) {
  const e = editor.value
  if (!e) return
  fn(e)
  e.commands.focus()
}

const isOn = (name: string, attrs?: Record<string, any>) => {
  tick.value
  return editor.value?.isActive(name, attrs) ?? false
}

async function editTitle() {
  const ch = currentChapter.value
  if (!ch) return
  const name = await promptBox('重命名章节', ch.title)
  if (name) renameChapter(ch, name)
}

// ★ 全新的一键排版：只在段首插入全角空格，不乱动任何文字
function oneClickFormat() {
  const e = editor.value
  if (!e) return
  const { state, view } = e
  const tr = state.tr
  const targets: { from: number, to: number, text: string }[] = []

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const text = node.textContent
      // 如果段落有字，且不是以全角空格开头，则标记需要插入
      if (text.trim()) {
        const cleaned = text.replace(/^[　 ]+/, '') // 先清空原来的段首空白
        const newText = `　　${cleaned}` // 统一加两个全角空格
        if (text !== newText) {
          targets.push({ from: pos + 1, to: pos + node.nodeSize - 1, text: newText })
        }
      }
    }
  })

  if (targets.length > 0) {
    // 从后往前替换，防止修改后节点位置偏移导致错乱
    targets.reverse().forEach(t => {
      tr.replaceWith(t.from, t.to, state.schema.text(t.text))
    })
    view.dispatch(tr)
    
    // 自动关掉视觉缩进，防止变成 4 个字符
    if (settings.indent) {
      settings.indent = false
      saveSettings()
    }
    toast('排版完成：已添加实际缩进字符')
  } else {
    toast('文本已是标准排版状态')
  }
}

// ★ 全新的一键清除缩进：只删除段首的空白字符
function clearIndent() {
  const e = editor.value
  if (!e) return
  const { state, view } = e
  const tr = state.tr
  const targets: { from: number, to: number, text: string }[] = []

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const text = node.textContent
      // 匹配开头的所有全角或半角空格
      const match = text.match(/^[　 ]+/)
      if (match) {
        const newText = text.replace(/^[　 ]+/, '')
        targets.push({ from: pos + 1, to: pos + node.nodeSize - 1, text: newText })
      }
    }
  })

  if (targets.length > 0) {
    // 同样从后往前删
    targets.reverse().forEach(t => {
      tr.replaceWith(t.from, t.to, state.schema.text(t.text))
    })
    view.dispatch(tr)
    toast('已清除段首缩进字符')
  } else {
    toast('没有需要清除的缩进')
  }
}
</script>

<template>
  <div v-if="!app.book" class="empty-state">
    <div class="empty-logo">墨</div>
    <h2>墨匣</h2>
    <p>纯本地的小说写作台 · 不联网 · 不登录</p>
    <p class="dim">在左侧「书籍管理」里点 ＋ 新建，或用「导入」读入 md / txt</p>
  </div>

  <div v-else class="editor-wrap">
    <div class="toolbar">
      <button class="icon-btn" :class="{ on: isOn('bold') }" title="加粗" @click="run((e) => e.chain().focus().toggleBold().run())"><b>B</b></button>
      <button class="icon-btn" :class="{ on: isOn('italic') }" title="斜体" @click="run((e) => e.chain().focus().toggleItalic().run())"><i>I</i></button>
      <button class="icon-btn" :class="{ on: isOn('strike') }" title="删除线" @click="run((e) => e.chain().focus().toggleStrike().run())"><s>S</s></button>
      <span class="sep" />
      <button class="icon-btn" :class="{ on: isOn('bulletList') }" title="无序列表" @click="run((e) => e.chain().focus().toggleBulletList().run())">☰</button>
      <button class="icon-btn" :class="{ on: isOn('orderedList') }" title="有序列表" @click="run((e) => e.chain().focus().toggleOrderedList().run())">1.</button>
      <button class="icon-btn" :class="{ on: isOn('blockquote') }" title="引用" @click="run((e) => e.chain().focus().toggleBlockquote().run())">❝</button>
      <button class="icon-btn" title="分割线" @click="run((e) => e.chain().focus().setHorizontalRule().run())">—</button>
      <span class="sep" />
      <!-- 一键排版与清除缩进 -->
      <button class="icon-btn" title="一键排版（首行缩进并去空行）" @click="oneClickFormat">排版</button>
      <button class="icon-btn" title="一键清除首行缩进" @click="clearIndent">除缩进</button>
      <span class="sep" />
      <button class="icon-btn" title="撤销" @click="run((e) => e.chain().focus().undo().run())">↺</button>
      <button class="icon-btn" title="重做" @click="run((e) => e.chain().focus().redo().run())">↻</button>
    </div>

    <div class="chap-head">
      <button class="chap-name" title="点击重命名本章" @click="editTitle">
        {{ currentChapter?.title || '未选择章节' }}
      </button>
      <div class="chap-counts">
        <span>本章 <b>{{ chWords }}</b> 字</span>
        <span>全书 <b>{{ allWords }}</b> 字</span>
      </div>
    </div>

    <div class="editor-scroll">
      <div class="Ep" :class="{ Si: isEmpty }">
        <div ref="mountEl" />
      </div>
    </div>

    <div v-if="settings.showStatusbar" class="statusbar">
      <span>{{ app.book.title }}</span>
      <span class="grow" />
      <span v-if="app.dirty">未保存</span>
      <span v-else-if="app.saving">保存中…</span>
      <span v-else>已保存</span>
    </div>
  </div>
</template>

<!-- ★ 移除了原来的 <style scoped>，因为 main.css 已经全局接管了线格纸和字体渲染 -->
