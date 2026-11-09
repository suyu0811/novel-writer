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
  totalWords,
  replaceInBook // ★ 引入替换方法
} from '../lib/book'
import { docToMd, mdToHtml } from '../lib/richtext'
import { promptBox, toast } from '../lib/ui'
import { settings, saveSettings } from '../lib/settings'

const editor = shallowRef<Editor | null>(null)
const tick = ref(0)
const mountEl = ref<HTMLElement | null>(null)
let internal = false

// ★ 抽屉状态
const showDrawer = ref(false)
const activeDrawerChapterId = ref(localStorage.getItem('drawerActiveChapter') || '')
const drawerScrollTop = ref(0)
const drawerBodyEl = ref<HTMLElement | null>(null)

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

// ★ 安全排版（保留你之前的要求）
function oneClickFormat() {
  const e = editor.value
  if (!e) return
  const { state, view } = e
  const tr = state.tr
  const targets: { from: number, to: number, text: string }[] = []

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const text = node.textContent
      if (text.trim()) {
        const cleaned = text.replace(/^[　 ]+/, '') 
        const newText = `　　${cleaned}` 
        if (text !== newText) {
          targets.push({ from: pos + 1, to: pos + node.nodeSize - 1, text: newText })
        }
      }
    }
  })

  if (targets.length > 0) {
    targets.reverse().forEach(t => {
      tr.replaceWith(t.from, t.to, state.schema.text(t.text))
    })
    view.dispatch(tr)
    if (settings.indent) {
      settings.indent = false
      saveSettings()
    }
    toast('排版完成')
  } else {
    toast('已是标准排版')
  }
}

function clearIndent() {
  const e = editor.value
  if (!e) return
  const { state, view } = e
  const tr = state.tr
  const targets: { from: number, to: number, text: string }[] = []

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      const text = node.textContent
      const match = text.match(/^[　 ]+/)
      if (match) {
        const newText = text.replace(/^[　 ]+/, '')
        targets.push({ from: pos + 1, to: pos + node.nodeSize - 1, text: newText })
      }
    }
  })

  if (targets.length > 0) {
    targets.reverse().forEach(t => {
      tr.replaceWith(t.from, t.to, state.schema.text(t.text))
    })
    view.dispatch(tr)
    toast('已清除段首缩进')
  } else {
    toast('没有需要清除的缩进')
  }
}

// ★ 抽屉逻辑
const settingVolumes = computed(() => {
  if (!app.book) return []
  return app.book.volumes.filter(v => v.isSetting)
})

const activeDrawerChapter = computed(() => {
  return findChapter(activeDrawerChapterId.value)
})

const drawerHtml = computed(() => {
  if (!activeDrawerChapter.value) return ''
  return mdToHtml(activeDrawerChapter.value.content)
})

function toggleDrawer() {
  showDrawer.value = !showDrawer.value
  if (showDrawer.value && drawerBodyEl.value) {
    // 恢复上次的滚动位置
    setTimeout(() => {
      if (drawerBodyEl.value) drawerBodyEl.value.scrollTop = drawerScrollTop.value
    }, 50)
  }
}

function onDrawerScroll(e: Event) {
  drawerScrollTop.value = (e.target as HTMLElement).scrollTop
}

function selectDrawerChapter(id: string) {
  activeDrawerChapterId.value = id
  localStorage.setItem('drawerActiveChapter', id)
  drawerScrollTop.value = 0 // 切换章节重置滚动
}
</script>

<template>
  <div v-if="!app.book" class="empty-state">
    <div class="empty-logo">墨</div>
    <h2>墨匣</h2>
    <p>纯本地的小说写作台 · 不联网 · 不登录</p>
  </div>

  <div v-else class="editor-wrap" style="position: relative;">
    <div class="toolbar">
      <button class="icon-btn" :class="{ on: isOn('bold') }" title="加粗" @click="run((e) => e.chain().focus().toggleBold().run())"><b>B</b></button>
      <button class="icon-btn" :class="{ on: isOn('italic') }" title="斜体" @click="run((e) => e.chain().focus().toggleItalic().run())"><i>I</i></button>
      <button class="icon-btn" :class="{ on: isOn('strike') }" title="删除线" @click="run((e) => e.chain().focus().toggleStrike().run())"><s>S</s></button>
      <span class="sep" />
      <button class="icon-btn" title="一键排版" @click="oneClickFormat">排版</button>
      <button class="icon-btn" title="一键清除首行缩进" @click="clearIndent">除缩进</button>
      <span class="sep" />
      <!-- ★ 新增：全书替换 -->
      <button class="icon-btn" title="全书替换" @click="replaceInBook">替换</button>
      <span class="sep" />
      <button class="icon-btn" title="撤销" @click="run((e) => e.chain().focus().undo().run())">↺</button>
      <button class="icon-btn" title="重做" @click="run((e) => e.chain().focus().redo().run())">↻</button>
      
      <span class="grow" />
      <!-- ★ 新增：抽屉呼出按钮 -->
      <button class="icon-btn" :class="{ on: showDrawer }" title="呼出设定集" @click="toggleDrawer">📖</button>
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

    <!-- ★ 右侧抽屉 -->
    <transition name="slide">
      <div v-if="showDrawer" class="drawer-panel">
        <div class="drawer-head">
          <select v-model="activeDrawerChapterId" @change="selectDrawerChapter(activeDrawerChapterId)" class="drawer-select">
            <option value="" disabled>选择设定章节</option>
            <template v-for="vol in settingVolumes" :key="vol.id">
              <optgroup :label="vol.title">
                <option v-for="ch in vol.chapters" :key="ch.id" :value="ch.id">
                  {{ ch.title }}
                </option>
              </optgroup>
            </template>
          </select>
          <button class="icon-btn" @click="showDrawer = false">✕</button>
        </div>
        <div class="drawer-body" ref="drawerBodyEl" @scroll="onDrawerScroll" :style="{ fontSize: settings.drawerFontSize + 'px' }">
          <div v-if="!activeDrawerChapter" class="tip" style="text-align: center; margin-top: 40px;">
            暂无设定或未选择
          </div>
          <div v-else class="drawer-content" v-html="drawerHtml"></div>
        </div>
      </div>
    </transition>

    <div v-if="settings.showStatusbar" class="statusbar">
      <span>{{ app.book.title }}</span>
      <span class="grow" />
      <span v-if="app.dirty">未保存</span>
      <span v-else>已保存</span>
    </div>
  </div>
</template>

<style scoped>
/* 抽屉样式 */
.drawer-panel {
  position: absolute;
  right: 0;
  top: 40px; /* 避开工具栏 */
  bottom: 30px; /* 避开状态栏 */
  width: 320px;
  background: var(--panel);
  border-left: 1px solid var(--line);
  box-shadow: -4px 0 15px rgba(0,0,0,0.05);
  display: flex;
  flex-direction: column;
  z-index: 10;
}
.drawer-head {
  display: flex;
  align-items: center;
  padding: 8px;
  border-bottom: 1px solid var(--line);
  background: var(--panel-2);
}
.drawer-select {
  flex: 1;
  padding: 6px;
  border: 1px solid var(--line);
  background: var(--bg);
  border-radius: 6px;
  margin-right: 8px;
  color: var(--text);
  outline: none;
}
.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  line-height: 1.6;
  color: var(--text);
}
.drawer-content :deep(p) {
  margin-bottom: 0.8em;
}

/* 动画 */
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}
</style>