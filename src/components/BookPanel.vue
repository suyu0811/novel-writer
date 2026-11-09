<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import {
  app,
  addChapter,
  closeBook,
  addVolume,
  countOf,
  deleteChapter,
  deleteVolume,
  moveChapter,
  moveVolume,
  openBook,
  renameChapter,
  renameVolume,
  selectChapter,
  toggleSettingVolume // ★ 新增引入
} from '../lib/book'
import { createBook, deleteBook, library, moveBook, renameBook } from '../lib/library'
import { actionSheet, confirmBox, promptBox, toast } from '../lib/ui'
import { pickAndImport } from '../lib/book'
import type { BookMeta } from '../lib/types'

const emit = defineEmits<{ (e: 'settings'): void; (e: 'close'): void }>()

const openBooks = ref<string[]>([])
const openVols = ref<string[]>([])
const isMobile = () => window.innerWidth <= 760

/* ---------------- 长按 ---------------- */
const press = { timer: 0 as any, x: 0, y: 0, fired: false }

function startPress(e: PointerEvent, fn: () => void) {
  press.x = e.clientX
  press.y = e.clientY
  press.fired = false
  clearTimeout(press.timer)
  press.timer = setTimeout(() => {
    press.fired = true
    fn()
  }, 520)
}
function movePress(e: PointerEvent) {
  if (Math.abs(e.clientX - press.x) > 10 || Math.abs(e.clientY - press.y) > 10) {
    clearTimeout(press.timer)
  }
}
function endPress() {
  clearTimeout(press.timer)
}
function consumePress(): boolean {
  if (press.fired) {
    press.fired = false
    return true
  }
  return false
}

/* ---------------- 书籍 ---------------- */

function isCurrent(dir: string) {
  return app.book?.dir === dir
}

function isOpen(dir: string) {
  return openBooks.value.includes(dir)
}

async function tapBook(meta: BookMeta) {
  if (consumePress()) return
  if (isCurrent(meta.dir)) {
    toggleBook(meta.dir)
    return
  }
  await openBook(meta)
  openBooks.value = [meta.dir]
  openVols.value = app.book?.volumes.length ? [app.book.volumes[0].id] : []
  if (isMobile()) emit('close')
}

function toggleBook(dir: string) {
  if (isOpen(dir)) {
    openBooks.value = openBooks.value.filter((d) => d !== dir)
  } else {
    openBooks.value = [...openBooks.value, dir]
  }
}

function bookMenu(meta: BookMeta) {
  actionSheet(meta.title, [
    {
      label: '重命名书籍',
      run: async () => {
        const current = app.book?.dir === meta.dir
        const newDir = await renameBook(meta)
        if (current && newDir) await openBook({ dir: newDir })
      }
    },
    {
      label: '上移一位',
      hint: '在书库列表里往前挪',
      run: async () => {
        await moveBook(meta, -1)
      }
    },
    {
      label: '下移一位',
      run: async () => {
        await moveBook(meta, 1)
      }
    },
    {
      label: '删除书籍',
      danger: true,
      hint: '整个书籍文件夹会被删除，不可恢复',
      run: async () => {
        const current = app.book?.dir === meta.dir
        await deleteBook(meta)
        openBooks.value = openBooks.value.filter((d) => d !== meta.dir)
        if (current) closeBook()
      }
    }
  ])
}

/* ---------------- 分卷 / 章节 ---------------- */

function isVolOpen(id: string) {
  return openVols.value.includes(id)
}
function toggleVol(id: string) {
  openVols.value = isVolOpen(id)
    ? openVols.value.filter((x) => x !== id)
    : [...openVols.value, id]
}

async function tapChapter(id: string) {
  if (consumePress()) return
  selectChapter(id)
  if (isMobile()) emit('close')
}

function volMenu(volId: string) {
  const vol = app.book?.volumes.find((v) => v.id === volId)
  if (!vol) return

  const actions = [
    {
      label: '重命名分卷',
      run: async () => {
        const name = await promptBox('重命名分卷', vol.title)
        if (name) renameVolume(vol, name)
      }
    },
    {
      label: '在本卷新增章节',
      run: () => addChapter(vol.id)
    },
    {
      label: '删除分卷',
      danger: true,
      hint: `「${vol.title}」及其中 ${vol.chapters.length} 章都会被删除`,
      run: async () => {
        const ok = await confirmBox('删除分卷', `「${vol.title}」及其中 ${vol.chapters.length} 章都会被删除。`, true)
        if (ok) deleteVolume(vol.id)
      }
    }
  ]

  // ★ 新增：只有第一卷可以设为设定集
  if (app.book?.volumes[0]?.id === vol.id) {
    actions.unshift({
      label: vol.isSetting ? '取消设定集卷' : '设为设定集卷',
      hint: '设定集卷不会参与全书替换，且导出 txt 时会被过滤',
      run: () => toggleSettingVolume(vol)
    })
  }

  actionSheet(vol.title, actions)
}

function chapterMenu(volId: string, chId: string) {
  const ch = app.book?.volumes.find((v) => v.id === volId)?.chapters.find((c) => c.id === chId)
  if (!ch) return
  actionSheet(ch.title, [
    {
      label: '重命名章节',
      run: async () => {
        const name = await promptBox('重命名章节', ch.title)
        if (name) renameChapter(ch, name)
      }
    },
    {
      label: '删除章节',
      danger: true,
      run: async () => {
        const ok = await confirmBox('删除章节', `《${ch.title}》将被删除。`, true)
        if (ok) deleteChapter(volId, chId)
      }
    }
  ])
}

/* ---------------- 拖动排序 ---------------- */

const drag = reactive({
  on: false,
  kind: '' as '' | 'vol' | 'ch',
  vol: -1,
  ch: -1,
  hover: '',
  targetVol: -1,
  targetCh: -1,
  valid: false
})

const listEl = ref<HTMLElement | null>(null)
const keyOf = (k: string, vi: number, ci: number) => `${k}:${vi}:${ci}`

function onDragDown(e: PointerEvent, kind: 'vol' | 'ch', vi: number, ci = -1) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  try {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  } catch {
    /* ignore */
  }
  drag.on = true
  drag.kind = kind
  drag.vol = vi
  drag.ch = ci
  drag.hover = ''
  drag.valid = false
  drag.targetVol = -1
  drag.targetCh = -1
  window.addEventListener('pointermove', onDragMove, { passive: false })
  window.addEventListener('pointerup', onDragUp)
  window.addEventListener('pointercancel', onDragUp)
  e.preventDefault()
  e.stopPropagation()
}

function onDragMove(e: PointerEvent) {
  if (!drag.on) return
  e.preventDefault()
  const box = listEl.value
  if (box) {
    const r = box.getBoundingClientRect()
    if (e.clientY < r.top + 44) box.scrollTop -= 10
    else if (e.clientY > r.bottom - 44) box.scrollTop += 10
  }
  const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
  const row = el?.closest('[data-row]') as HTMLElement | null
  if (!row || !row.dataset.kind) {
    drag.hover = ''
    drag.valid = false
    return
  }
  const kind = row.dataset.kind as 'vol' | 'ch'
  const vi = Number(row.dataset.vol)
  const ci = Number(row.dataset.ch ?? -1)
  const rect = row.getBoundingClientRect()
  const after = e.clientY > rect.top + rect.height / 2
  const total = app.book?.volumes.length || 0

  if (drag.kind === 'vol') {
    if (kind === 'vol') {
      drag.hover = keyOf(kind, vi, -1)
      drag.targetVol = after ? vi + 1 : vi
      drag.valid = drag.targetVol !== drag.vol && drag.targetVol !== drag.vol + 1
    } else {
      drag.hover = keyOf(kind, vi, ci)
      drag.targetVol = vi
      drag.valid = vi !== drag.vol
    }
    drag.targetCh = -1
  } else {
    if (kind === 'ch') {
      drag.hover = keyOf(kind, vi, ci)
      drag.targetVol = vi
      drag.targetCh = after ? ci + 1 : ci
      drag.valid = true
    } else {
      drag.hover = keyOf(kind, vi, -1)
      drag.targetVol = vi
      drag.targetCh = 0
      drag.valid = true
    }
    if (!(app.book?.volumes[drag.targetVol])) drag.valid = false
  }
  if (drag.targetVol > total) drag.valid = false
}

function onDragUp() {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragUp)
  window.removeEventListener('pointercancel', onDragUp)
  if (drag.on && drag.valid && app.book) {
    const v = app.book.volumes
    if (drag.kind === 'ch') {
      const src = v[drag.vol]
      const ch = src?.chapters[drag.ch]
      const tgt = v[drag.targetVol]
      if (src && ch && tgt) moveChapter(src.id, ch.id, tgt.id, drag.targetCh)
    } else if (drag.kind === 'vol') {
      moveVolume(drag.vol, drag.targetVol)
    }
  }
  drag.on = false
  drag.kind = ''
  drag.valid = false
  drag.hover = ''
  drag.targetVol = -1
  drag.targetCh = -1
}

/* ---------------- 新建 / 其它 ---------------- */

async function newBook() {
  const name = await promptBox('新建书籍', '新书', '输入书名，会自动在书库里建同名文件夹')
  if (!name) return
  const meta = await createBook(name)
  if (!meta) return
  await openBook(meta)
  openBooks.value = [meta.dir]
  openVols.value = app.book?.volumes.length ? [app.book.volumes[0].id] : []
  toast('已新建《' + meta.title + '》')
}

async function importOne() {
  await pickAndImport()
  if (app.book) {
    openBooks.value = [app.book.dir]
    openVols.value = app.book.volumes.length ? [app.book.volumes[0].id] : []
  }
}

function addVol() {
  if (!app.book) {
    toast('先打开一本书')
    return
  }
  addVolume()
  if (app.book.volumes.length) {
    const last = app.book.volumes[app.book.volumes.length - 1]
    openVols.value = [...openVols.value, last.id]
  }
}

watch(
  () => app.book?.dir,
  (dir) => {
    if (!dir) return
    if (!isOpen(dir)) openBooks.value = [dir]
  }
)
watch(
  () => app.activeChapterId,
  () => {
    const vol = app.book?.volumes.find((v) => v.chapters.some((c) => c.id === app.activeChapterId))
    if (vol && !isVolOpen(vol.id)) openVols.value = [...openVols.value, vol.id]
  },
  { immediate: true }
)

defineExpose({ newBook })
</script>

<template>
  <aside class="panel">
    <div class="panel-head">
      <div class="grow">
        <div class="panel-title">书籍管理</div>
        <div class="panel-sub">{{ library.books.length }} 本 · {{ library.root ? '本地根目录' : '未设置目录' }}</div>
      </div>
      <button class="icon-btn" title="新建书籍" @click="newBook">＋</button>
      <button class="icon-btn" title="关闭面板" @click="emit('close')">✕</button>
    </div>

    <div class="panel-tools">
      <button class="tool" @click="emit('settings')"><span>⚙</span>设置</button>
      <button class="tool" @click="importOne"><span>⇩</span>导入</button>
      <button class="tool" @click="addVol"><span>＋</span>新卷</button>
    </div>

    <div class="panel-sep" />

    <div ref="listEl" class="panel-list">
      <div v-if="!library.books.length" class="hint-box">
        书库还是空的。<br />点右上角「＋」新建一本，或用「导入」读入 md / txt。
      </div>

      <template v-for="bk in library.books" :key="bk.dir">
        <div
          class="bk-row"
          :class="{ active: isCurrent(bk.dir) }"
          @pointerdown="startPress($event, () => bookMenu(bk))"
          @pointermove="movePress"
          @pointerup="endPress"
          @pointercancel="endPress"
          @click="tapBook(bk)"
        >
          <span
            class="chev"
            :class="{ open: isOpen(bk.dir) && isCurrent(bk.dir) }"
            @click.stop="isCurrent(bk.dir) ? toggleBook(bk.dir) : tapBook(bk)"
          >
            {{ isOpen(bk.dir) && isCurrent(bk.dir) ? '▾' : '▸' }}
          </span>
          <span class="bk-name">{{ bk.title }}</span>
          <span v-if="isCurrent(bk.dir)" class="dot">●</span>
        </div>

        <template v-if="isOpen(bk.dir) && isCurrent(bk.dir)">
          <template v-for="(vol, vi) in app.book?.volumes || []" :key="vol.id">
            <div
              class="row vol"
              data-row
              data-kind="vol"
              :data-vol="vi"
              :class="{
                dragging: drag.on && drag.kind === 'vol' && drag.vol === vi,
                'drop-target': drag.on && drag.valid && drag.hover === keyOf('vol', vi, -1)
              }"
              @pointerdown="startPress($event, () => volMenu(vol.id))"
              @pointermove="movePress"
              @pointerup="endPress"
              @pointercancel="endPress"
              @click="!consumePress() && toggleVol(vol.id)"
            >
              <span class="drag" @pointerdown.stop="onDragDown($event, 'vol', vi)" @click.stop>⠿</span>
              <span class="name">
                {{ vol.title }}
                <!-- ★ 新增：如果是设定集，显示小书本图标 -->
                <span v-if="vol.isSetting" title="设定集卷" style="color: var(--accent); margin-left: 4px;">📖</span>
              </span>
              <span class="cnt">{{ vol.chapters.length }}</span>
              <button class="mini" title="新增章节" @click.stop="addChapter(vol.id)">＋</button>
            </div>

            <template v-if="isVolOpen(vol.id)">
              <div
                v-for="(ch, ci) in vol.chapters"
                :key="ch.id"
                class="row ch"
                data-row
                data-kind="ch"
                :data-vol="vi"
                :data-ch="ci"
                :class="{
                  active: ch.id === app.activeChapterId,
                  dragging: drag.on && drag.kind === 'ch' && drag.vol === vi && drag.ch === ci,
                  'drop-target': drag.on && drag.valid && drag.hover === keyOf('ch', vi, ci)
                }"
                @pointerdown="startPress($event, () => chapterMenu(vol.id, ch.id))"
                @pointermove="movePress"
                @pointerup="endPress"
                @pointercancel="endPress"
                @click="tapChapter(ch.id)"
              >
                <span class="drag" @pointerdown.stop="onDragDown($event, 'ch', vi, ci)" @click.stop>⠿</span>
                <span class="name">{{ ch.title }}</span>
                <span class="cnt">{{ countOf(ch.id) }}</span>
              </div>
            </template>
          </template>
        </template>
      </template>
    </div>
  </aside>
</template>