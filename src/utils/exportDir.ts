import { store } from '@tauri-apps/plugin-store'

let saveStore: Awaited<ReturnType<typeof store.load>> | null = null
const KEY = 'defaultExportDir'

async function getStore() {
  if (!saveStore) {
    saveStore = await store.load('settings.json')
  }
  return saveStore
}

export async function getDefaultExportDir(): Promise<string> {
  const s = await getStore()
  const val = await s.get<string>(KEY)
  return val ?? ''
}

export async function setDefaultExportDir(path: string): Promise<void> {
  const s = await getStore()
  await s.set(KEY, path)
  await s.save()
}
