<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import {
  checkPassword,
  clearPassword,
  saveSettings,
  setPassword,
  settings,
  updateRotation
} from '../lib/settings'
import { loadLibrary, library, scanLibrary } from '../lib/library'
import { archives, deleteArchive, restoreArchive } from '../lib/book'
import { pickFolder } from '../lib/storage'
import { confirmBox, promptBox, toast } from '../lib/ui'
import { getDefaultExportDir, setDefaultExportDir } from '@/utils/exportDir'

const emit = defineEmits<{ (e: 'close'): void }>()

const accents = ['#8a6a4f', '#3f6f5b', '#4a5f8a', '#8a4a56', '#5b5468', '#2f2f2f']

const customAccent = ref(settings.accent)
function applyCustomAccent() {
  pickAccent(customAccent.value)
}

// ★ 新增：软件名称更改
const appDisplayName = ref(localStorage.getItem('app_display_name') || '墨匣')
function saveAppName() {
  localStorage.setItem('app_display_name', appDisplayName.value)
  toast('名称已保存，返回即可看到')
}

// ★ 新增：本地字体导入
function handleFontUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (event) => {
    const base64 = event.target?.result as string
    localStorage.setItem('custom_font_data', base64)
    localStorage.setItem('custom_font_name', file.name)
    applyCustomFont(base64, file.name)
    toast('字体已保存，重启不丢失')
  }
  reader.readAsDataURL(file)
}

function applyCustomFont(data: string, name: string) {
  try {
    const font = new FontFace(name, `url(${data})`)
    font.load().then((loadedFont) => {
      document.fonts.add(loadedFont)
      document.documentElement.style.setProperty('--editor-custom-font', `"${name}", system-ui`)
    })
  } catch (err) {
    console.error(err)
  }
}

const exportDir = ref('')
async function refreshExportPath() {
  exportDir.value = await getDefaultExportDir()
}
async function pickExportDir() {
  await setDefaultExportDir()
  await refreshExportPath()
}

onMounted(refreshExportPath)

function toggle(key: 'night' | 'showStatusbar' | 'indent' | 'ruled' | 'forceLandscape') {
  ;(settings as any)[key] = !(settings as any)[key]
  saveSettings()
}

async function togglePassword() {
  if (settings.passwordEnabled) {
    const pwd = await promptBox('关闭密码保护', '', '需要先输入当前密码')
    if (!pwd) return
    if (!(await checkPassword(pwd))) {
      toast('密码不正确')
      return
    }
    clearPassword()
    toast('已关闭密码保护')
    return
  }
  const p1 = await promptBox('设置密码', '', '输入 4–6 位数字，每次打开 App 时输入')
  if (!p1) return
  if (!/^\d{4,6}$/.test(p1)) {
    toast('请设置 4–6 位数字')
    return
  }
  const p2 = await promptBox('再输入一次', '', '确认密码')
  if (!p2) return
  if (p1 !== p2) {
    toast('两次输入不一致')
    return
  }
  await setPassword(p1)
  toast('已开启密码保护')
}

async function changeRoot() {
  const dir = await pickFolder('选择书库根目录（所有书都会存在这里）')
  if (!dir) return
  settings.rootDir = dir
  saveSettings()
  await loadLibrary(dir)
  await scanLibrary(dir)
  toast('根目录已切换，共找到 ' + library.books.length + ' 本')
}

async function refreshLibrary() {
  await loadLibrary()
  toast('已刷新，共 ' + library.books.length + ' 本')
}

function setFontSize(e: Event) {
  settings.fontSize = Number((e.target as HTMLInputElement).value)
  saveSettings()
}
function setLineHeight(e: Event) {
  settings.lineHeight = Number((e.target as HTMLInputElement).value)
  saveSettings()
}
// ★ 新增：抽屉字号调节
function setDrawerFontSize(e: Event) {
  settings.drawerFontSize = Number((e.target as HTMLInputElement).value)
  saveSettings()
}

function pickAccent(c: string) {
  settings.accent = c
  saveSettings()
}
function toggleSerif() {
  settings.serif = !settings.serif
  saveSettings()
}

const autoCount = computed(() => archives.items.filter((i) => i.kind === 'auto').length)
const manualCount = computed(() => archives.items.filter((i) => i.kind === 'manual').length)

async function restore(item: any) {
  await restoreArchive(item)
}
async function remove(item: any) {
  const ok = await confirmBox('删除存档', `删除 ${item.stamp} 的存档文件？`, true)
  if (ok) await deleteArchive(item)
}
</script>

<template>
  <div class="sheet-mask" @click.self="emit('close')">
    <div class="settings-card">
      <div class="card-head">
        <h3>设置</h3>
        <button class="icon-btn" @click="emit('close')">✕</button>
      </div>

      <div class="card-body">
        <div class="group-title">写作</div>

        <div class="opt" @click="toggle('night')">
          <div class="opt-text">
            <div class="opt-label">夜晚模式</div>
            <div class="opt-hint">整体切换深色主题，护眼</div>
          </div>
          <div class="sw" :class="{ on: settings.night }"><i /></div>
        </div>

        <div class="opt" @click="toggle('showStatusbar')">
          <div class="opt-text">
            <div class="opt-label">显示编辑状态栏</div>
            <div class="opt-hint">底部显示书名和保存状态</div>
          </div>
          <div class="sw" :class="{ on: settings.showStatusbar }"><i /></div>
        </div>

        <div class="opt" @click="toggle('indent')">
          <div class="opt-text">
            <div class="opt-label">默认首行缩进</div>
            <div class="opt-hint">每个自然段缩进两个字符</div>
          </div>
          <div class="sw" :class="{ on: settings.indent }"><i /></div>
        </div>

        <div class="opt" @click="toggle('ruled')">
          <div class="opt-text">
            <div class="opt-label">显示下划线</div>
            <div class="opt-hint">开启为线格纸效果，关闭为白纸</div>
          </div>
          <div class="sw" :class="{ on: settings.ruled }"><i /></div>
        </div>

        <div class="opt" @click="toggle('forceLandscape')">
          <div class="opt-text">
            <div class="opt-label">强制横屏</div>
            <div class="opt-hint">竖屏时把界面旋转 90°，方便接蓝牙键盘</div>
          </div>
          <div class="sw" :class="{ on: settings.forceLandscape }"><i /></div>
        </div>

        <div class="opt" @click="togglePassword">
          <div class="opt-text">
            <div class="opt-label">密码保护</div>
            <div class="opt-hint">开启后每次启动需要输入本机数字密码</div>
          </div>
          <div class="sw" :class="{ on: settings.passwordEnabled }"><i /></div>
        </div>

        <!-- ★ 新增：更换软件名 -->
        <div class="field">
          <span class="fl">软件名称</span>
          <input type="text" v-model="appDisplayName" @change="saveAppName" style="flex:1; padding: 6px; border-radius: 4px; border:1px solid #ccc; outline:none;" />
        </div>

        <div class="group-title">存储</div>
        <div class="opt col" @click="changeRoot">
          <div class="opt-text">
            <div class="opt-label">文件存储根目录</div>
            <div class="opt-hint path">{{ settings.rootDir || '未设置，使用默认文档目录' }}</div>
          </div>
          <button class="sheet-btn" @click.stop="changeRoot">更改</button>
        </div>
        <div class="opt col" @click="pickExportDir">
          <div class="opt-text">
            <div class="opt-label">默认导出目录</div>
            <div class="opt-hint path">{{ exportDir || '未设置，使用系统默认' }}</div>
          </div>
          <button class="sheet-btn" @click.stop="pickExportDir">更改</button>
        </div>
        <div class="opt col">
          <div class="opt-text">
            <div class="opt-label">书库索引</div>
            <div class="opt-hint">共 {{ library.books.length }} 本，目录变化后可重新扫描</div>
          </div>
          <button class="sheet-btn" @click.stop="refreshLibrary">重新扫描</button>
        </div>

        <div class="group-title">外观</div>
        <!-- ★ 修改：字号范围 15-40 -->
        <div class="field">
          <span class="fl">字号</span>
          <input type="range" min="15" max="40" step="1" :value="settings.fontSize" @input="setFontSize" />
          <span class="fv">{{ settings.fontSize }}</span>
        </div>
        <div class="field">
          <span class="fl">行距</span>
          <input type="range" min="1.4" max="2.6" step="0.05" :value="settings.lineHeight" @input="setLineHeight" />
          <span class="fv">{{ settings.lineHeight.toFixed(2) }}</span>
        </div>
        
        <!-- ★ 新增：抽屉字号调节 -->
        <div class="field">
          <span class="fl">抽屉字号</span>
          <input type="range" min="10" max="30" step="1" :value="settings.drawerFontSize" @input="setDrawerFontSize" />
          <span class="fv">{{ settings.drawerFontSize }}</span>
        </div>

        <!-- ★ 新增：自定义字体导入 -->
        <div class="field">
          <span class="fl">本地字体</span>
          <input type="file" accept=".ttf,.otf,.woff,.woff2" @change="handleFontUpload" style="font-size:12px; width:150px" />
        </div>

        <div class="field">
          <span class="fl">主色</span>
          <div class="swatches">
            <span
              v-for="c in accents"
              :key="c"
              class="swatch"
              :class="{ on: settings.accent === c }"
              :style="{ background: c }"
              @click="pickAccent(c)"
            />
            <label class="swatch custom-swatch" :style="{ background: customAccent }">
              <input
                type="color"
                v-model="customAccent"
                @input="applyCustomAccent"
                style="opacity:0;position:absolute;width:100%;height:100%;cursor:pointer"
              />
              <span v-if="!accents.includes(settings.accent)" class="mark">✓</span>
            </label>
          </div>
        </div>
        <div class="opt" @click="toggleSerif">
          <div class="opt-text">
            <div class="opt-label">宋体阅读模式</div>
            <div class="opt-hint">默认跟随系统字体</div>
          </div>
          <div class="sw" :class="{ on: settings.serif }"><i /></div>
        </div>

        <div class="group-title">存档记录</div>
        <div v-if="archives.items.length" class="arch-list">
          <div v-for="it in archives.items" :key="it.name" class="arch-row">
            <span class="badge" :class="it.kind">{{ it.kind === 'manual' ? '手动' : '自动' }}</span>
            <span class="arch-time">{{ it.stamp }}</span>
            <span class="grow" />
            <button class="mini2" @click="restore(it)">恢复</button>
            <button class="mini2 danger" @click="remove(it)">删除</button>
          </div>
        </div>
        <div v-else class="tip">还没有存档。编辑时每 10 分钟自动存档（最多 5 份），点顶部「存档」可手动存档。</div>
        <div class="tip" v-if="archives.items.length">
          自动存档 {{ autoCount }} 份 · 手动存档 {{ manualCount }} 份（手动存档后自动档会被清空）
        </div>

        <div class="group-title">关于</div>
        <div class="tip" style="margin: 0">
          所有正文是纯 Markdown（book.md），放在你设置的根目录下，一本一个文件夹。
          不加密、不上传、无需账号。换设备时把整个根目录拷过去，或者用「导入」逐个读入。
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.custom-swatch {
  position: relative;
  border: 1px dashed #aaa;
}
.custom-swatch .mark {
  color: #fff;
  text-shadow: 0 0 2px #000;
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
}
</style>