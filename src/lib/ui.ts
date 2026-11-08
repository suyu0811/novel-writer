import { reactive } from 'vue'

export interface ModalState {
  kind: 'confirm' | 'prompt'
  title: string
  message: string
  value: string
  placeholder: string
  danger: boolean
  resolve: (v: any) => void
}

export interface SheetOption {
  label: string
  hint?: string
  danger?: boolean
  run: () => void | Promise<void>
}

export interface SheetState {
  title: string
  options: SheetOption[]
}

export const ui = reactive({
  toast: '',
  toastTimer: 0 as number | ReturnType<typeof setTimeout>,
  modal: null as ModalState | null,
  sheet: null as SheetState | null
})

export function toast(msg: string, ms = 1800) {
  ui.toast = msg
  clearTimeout(ui.toastTimer as number)
  ui.toastTimer = setTimeout(() => (ui.toast = ''), ms)
}

export function confirmBox(title: string, message = '', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    ui.modal = { kind: 'confirm', title, message, value: '', placeholder: '', danger, resolve }
  })
}

export function promptBox(
  title: string,
  value = '',
  message = '',
  placeholder = ''
): Promise<string | null> {
  return new Promise((resolve) => {
    ui.modal = { kind: 'prompt', title, message, value, placeholder, danger: false, resolve }
  })
}

export function closeModal(result: any) {
  const m = ui.modal
  ui.modal = null
  m?.resolve(result)
}

/** 底部动作面板（长按菜单用） */
let sheetOpenedAt = 0

export function actionSheet(title: string, options: SheetOption[]) {
  sheetOpenedAt = Date.now()
  ui.sheet = { title, options }
}

/** 刚弹出的 400ms 内忽略点击，避免长按抬手产生的合成 click 立刻把面板关掉 */
export function sheetJustOpened(): boolean {
  return Date.now() - sheetOpenedAt < 400
}

export function closeSheet() {
  if (sheetJustOpened()) return
  ui.sheet = null
}

export async function runSheetOption(opt: SheetOption) {
  ui.sheet = null
  await opt.run()
}
