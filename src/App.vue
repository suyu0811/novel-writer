<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import BookPanel from './components/BookPanel.vue'
import EditorPane from './components/EditorPane.vue'
import SettingsSheet from './components/SettingsSheet.vue'
import LockScreen from './components/LockScreen.vue'
import ModalHost from './components/ModalHost.vue'
import { app, autoArchive, exportBook, manualArchive, openLastBook } from './lib/book'
import { loadLibrary } from './lib/library'
import { hasPassword, loadSettings, saveSettings, screen, settings, updateRotation } from './lib/settings'
import { actionSheet, toast } from './lib/ui'

const panelOpen = ref(window.innerWidth > 760)
const showSettings = ref(false)
const locked = ref(false)
const mobile = ref(window.innerWidth <= 760)
const appName = ref('墨匣') // ★ 新增：动态软件名

let archiveTimer: any = 0

function updateAppName() {
  appName.value = localStorage.getItem('app_display_name') || '墨匣'
}

function syncViewport() {
  mobile.value = window.innerWidth <= 760
  updateRotation()
}

function togglePanel() {
  panelOpen.value = !panelOpen.value
}

function toggleNight() {
  settings.night = !settings.night
  saveSettings()
}

function closeSettings() {
  showSettings.value = false
  updateAppName() // 关闭设置时刷新名字
}

function openExport() {
  if (!app.book) {
    toast('先打开一本书')
    return
  }
  actionSheet('导出全书', [
    { label: 'Markdown（.md）', hint: '纯文本，保留卷 / 章结构', run: () => exportBook('md') },
    { label: '纯文本（.txt）', hint: '方便导入其它阅读器或平台', run: () => exportBook('txt') },
    { label: '压缩包（.zip）', hint: '含 md、txt 和按卷拆分的章节文件', run: () => exportBook('zip') }
  ])
}

async function doArchive() {
  if (!app.book) {
    toast('先打开一本书')
    return
  }
  await manualArchive()
}

/* ---------------- 边缘滑动 ---------------- */
let swiping = false
let sx = 0
let sy = 0

function onEdgeDown(e: TouchEvent) {
  const t = e.touches[0]
  sx = t.clientX
  sy = t.clientY
  swiping = true
}
function onEdgeMove(e: TouchEvent) {
  if (!swiping) return
  const t = e.touches[0]
  const dx = t.clientX - sx
  if (Math.abs(t.clientY - sy) > 30 && dx < 20) {
    swiping = false
    return
  }
  if (dx > 46) {
    swiping = false
    panelOpen.value = true
  }
}
function onEdgeUp() {
  swiping = false
}

/* ---------------- 生命周期 ---------------- */
function onKey(e: KeyboardEvent) {
  const meta = e.ctrlKey || e.metaKey
  if (meta && e.key.toLowerCase() === 's') {
    e.preventDefault()
    void doArchive()
  }
  if (e.key === 'Escape' && showSettings.value) showSettings.value = false
}

function onHide() {
  if (document.visibilityState === 'hidden' && app.dirty) void autoArchive().catch(() => {})
}

async function onUnlocked() {
  locked.value = false
  await openLastBook()
}

onMounted(async () => {
  loadSettings()
  updateAppName() // 初始化读取名字
  syncViewport()
  await loadLibrary()
  if (hasPassword()) {
    locked.value = true
  } else {
    await openLastBook()
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', syncViewport)
  document.addEventListener('visibilitychange', onHide)
  archiveTimer = setInterval(() => void autoArchive().catch(() => {}), 10 * 60 * 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', syncViewport)
  document.removeEventListener('visibilitychange', onHide)
  clearInterval(archiveTimer)
})
</script>

<template>
  <div class="shell" :class="{ rotated: screen.rotated }">
    <header class="topbar">
      <button class="icon-btn" title="书库面板" @click="togglePanel">☰</button>
      <div class="title">{{ app.book?.title || appName }}</div>
      <span class="grow" />
      <button class="icon-btn" title="手动存档（保存并清理自动存档）" @click="doArchive">⤓</button>
      <button class="icon-btn" title="导出全书" @click="openExport">⇪</button>
      <button
        class="icon-btn"
        :title="settings.night ? '切换到浅色' : '开启夜晚模式'"
        @click="toggleNight"
      >
        {{ settings.night ? '☾' : '☀' }}
      </button>
    </header>

    <div class="body">
      <BookPanel
        v-show="panelOpen"
        :class="{ 'show-mobile': panelOpen }"
        @settings="showSettings = true"
        @close="panelOpen = false"
      />
      <div v-if="panelOpen && mobile" class="panel-mask" @click="panelOpen = false" />
      <main class="main">
        <EditorPane />
      </main>
    </div>

    <SettingsSheet v-if="showSettings" @close="closeSettings" />
    <ModalHost />

    <!-- 手机端：从左边往右滑打开面板 -->
    <div
      v-if="mobile && !panelOpen && !locked"
      class="edge-swipe"
      @touchstart.passive="onEdgeDown"
      @touchmove.passive="onEdgeMove"
      @touchend="onEdgeUp"
    />

    <LockScreen v-if="locked" @unlocked="onUnlocked" />
  </div>
</template>
