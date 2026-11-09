import { reactive } from 'vue'

export interface Settings {
  /** 1 夜晚模式 */
  night: boolean
  /** 2 显示编辑状态栏 */
  showStatusbar: boolean
  /** 3 默认首行缩进 */
  indent: boolean
  /** 4 显示下划线（线格纸） */
  ruled: boolean
  /** 5 文件存储根目录 */
  rootDir: string
  /** 6 强制横屏 */
  forceLandscape: boolean
  /** 7 密码保护 */
  passwordEnabled: boolean

  /** 外观细节（可自定义） */
  accent: string
  fontSize: number
  lineHeight: number
  serif: boolean
  drawerFontSize: number // ★ 新增：设定集抽屉字号
}

const KEY = 'mw.settings.v2'
const SEC_KEY = 'mw.security'

const DEFAULTS: Settings = {
  night: false,
  showStatusbar: true,
  indent: true,
  ruled: false,
  rootDir: '',
  forceLandscape: false,
  passwordEnabled: false,
  accent: '#8a6a4f',
  fontSize: 17,
  lineHeight: 1.9,
  serif: false,
  drawerFontSize: 14 // ★ 新增：默认字号 14
}

export const settings = reactive<Settings>({ ...DEFAULTS })

/** 横屏旋转是否生效（由 App 在 resize 时刷新） */
export const screen = reactive({ rotated: false })

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}')
    Object.assign(settings, DEFAULTS, raw)
  } catch {
    Object.assign(settings, DEFAULTS)
  }
  settings.fontSize = Number(settings.fontSize) || DEFAULTS.fontSize
  settings.lineHeight = Number(settings.lineHeight) || DEFAULTS.lineHeight
  settings.accent = settings.accent || DEFAULTS.accent
  // ★ 新增：确保抽屉字号是数字
  settings.drawerFontSize = Number(settings.drawerFontSize) || DEFAULTS.drawerFontSize
  if (!settings.rootDir) settings.rootDir = ''
  settings.passwordEnabled = !!settings.passwordEnabled
  applySettings()
}

export function saveSettings() {
  localStorage.setItem(KEY, JSON.stringify(settings))
  applySettings()
}

export function applySettings() {
  const root = document.documentElement
  root.classList.toggle('dark', settings.night)
  root.classList.toggle('ruled', settings.ruled)
  root.classList.toggle('indent', settings.indent)
  root.style.setProperty('--accent', settings.accent)
  root.style.setProperty('--editor-size', settings.fontSize + 'px')
  root.style.setProperty('--editor-lh', String(settings.lineHeight))
  root.style.setProperty(
    '--editor-family',
    settings.serif
      ? 'ui-serif, "Songti SC", "宋体", "Noto Serif SC", serif'
      : 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif'
  )
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', settings.night ? '#171614' : '#f6f4ef')
  updateRotation()
}

export function updateRotation() {
  const portrait = window.innerHeight > window.innerWidth
  screen.rotated = settings.forceLandscape && portrait
}

/* ---------------- 密码保护 ---------------- */

interface Security {
  salt: string
  hash: string
}

function readSecurity(): Security | null {
  try {
    const s = JSON.parse(localStorage.getItem(SEC_KEY) || 'null')
    return s && s.hash ? s : null
  } catch {
    return null
  }
}

async function digest(text: string): Promise<string> {
  if (window.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  let h1 = 0x811c9dc5
  let h2 = 0xc2b2ae35
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = (h1 ^ c) * 0x01000193
    h2 = (h2 ^ c) * 0x85ebca6b
  }
  return (h1 >>> 0).toString(16) + (h2 >>> 0).toString(16)
}

export function hasPassword(): boolean {
  return settings.passwordEnabled && !!readSecurity()
}

export async function setPassword(pwd: string): Promise<void> {
  const salt = Math.random().toString(36).slice(2, 12)
  const hash = await digest(salt + ':' + pwd)
  localStorage.setItem(SEC_KEY, JSON.stringify({ salt, hash }))
  settings.passwordEnabled = true
  saveSettings()
}

export async function checkPassword(pwd: string): Promise<boolean> {
  const s = readSecurity()
  if (!s) return true
  return (await digest(s.salt + ':' + pwd)) === s.hash
}

export function clearPassword() {
  localStorage.removeItem(SEC_KEY)
  settings.passwordEnabled = false
  saveSettings()
}