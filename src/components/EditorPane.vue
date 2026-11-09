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
import { settings } from '../lib/settings'

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
  // ★ 新增：启动时应用本地字体
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

// ★ 新增：一键排版
function oneClickFormat() {
  const e = editor.value
  if (!e) return
  const { state, view } = e
  const tr = state.tr
  let hasChanged = false

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      let text = node.textContent.trim()
      if (text) {
        // 强制增加两个全角空格进行缩进，同时去掉原有的多余首空格
        const newText = `　　${text.replace(/^[　 ]+/, '')}`
        tr.replaceWith(pos + 1, pos + node.nodeSize - 1, state.schema.text(newText))
        hasChanged = true
      }
    }
  })
  if (hasChanged) {
    view.dispatch(tr)
    toast('排版完成')
  }
}

// ★ 新增：一键清除缩进
function clearIndent() {
  const e = editor.value
  if (!e) return
  const { state, view } = e
  const tr = state.tr
  let hasChanged = false

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      let text = node.textContent
      // 清除段首的全角空格或普通空格
      if (text.startsWith('　　') || text.startsWith('  ')) {
        const newText = text.replace(/^[　 ]+/, '')
        tr.replaceWith(pos + 1, pos + node.nodeSize - 1, state.schema.text(newText))
        hasChanged = true
      }
    }
  })
  if (hasChanged) {
    view.dispatch(tr)
    toast('已清除段首缩进')
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
      <!-- ★ 新增：一键排版与清除缩进 -->
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

<style scoped>
/* ★ 新增：动态字体绑定和线格纸自适应 */
:deep(.ProseMirror) {
  font-family: var(--editor-custom-font, inherit); /* 调用自定义字体 */
}

/* 如果你原本这里没有写线格纸样式，需要去 main.css 里改。如果在这儿，用这个：
   让下划线高度跟随行距和字号自动变化 */
.Ep :deep(.ProseMirror) {
  background-size: 100% calc(var(--editor-line-height, 1.8) * var(--editor-font-size, 18px)) !important;
  background-image: linear-gradient(transparent calc(var(--editor-line-height, 1.8) * var(--editor-font-size, 18px) - 1px), rgba(0,0,0,0.1) calc(var(--editor-line-height, 1.8) * var(--editor-font-size, 18px))) !important;
}
</style>
