import { Store } from '@tauri-apps/plugin-store'
import { open } from '@tauri-apps/plugin-dialog'

let saveStore: Store | null = null
const KEY = 'defaultExportDir'

async function getStore() {
  if (!saveStore) {
    saveStore = await Store.load('settings.json')
  }
  return saveStore
}

export async function getDefaultExportDir(): Promise<string> {
  const s = await getStore()
  const val = await s.get<string>(KEY)
  return val ?? ''
}

export async function setDefaultExportDir() {
  // 弹窗让用户选择一个文件夹
  const dir = await open({
    directory: true,
    multiple: false,
    title: '选择默认导出文件夹'
  })
  
  if (dir) {
    const s = await getStore()
    await s.set(KEY, dir)
    await s.save()
  }
}
