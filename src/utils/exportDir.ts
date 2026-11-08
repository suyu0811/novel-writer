import { Store } from '@tauri-apps/plugin-store'

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

export async function setDefaultExportDir(path: string) {
  const s = await getStore()
  await s.set(KEY, path)
  await s.save()
}
