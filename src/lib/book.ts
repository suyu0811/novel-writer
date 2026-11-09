// 在文件顶部引入 platform
import { platform } from '@tauri-apps/plugin-os'

// ============ 替换底部的 doExport 函数 ============
async function doExport(b: Book, kind: ExportKind) {
  await saveNow()
  const stem = safeName(b.title)
  const ext = `.${kind}`
  
  let path = ''

  // ★ 判断平台
  if (platform() === 'android' || platform() === 'ios') {
    // 安卓/苹果：静默保存在当前书库的所在目录（或单独的导出目录）
    // 我们在书库根目录下建一个“导出”文件夹，方便用户去手机文件夹找
    const exportDir = joinPath(library.root, '导出')
    await mkdir(exportDir)
    path = joinPath(exportDir, stem + ext)
    toast('正在导出到书库根目录的“导出”文件夹...')
  } else {
    // Windows / Mac：依然使用系统弹窗，允许自由选择
    const defaultDir = await getDefaultExportDir()
    let defaultPath = stem + ext
    if (defaultDir) {
      const sep = defaultDir.includes('\\') ? '\\' : '/'
      defaultPath = defaultDir.replace(/[\\/]$/, '') + sep + stem + ext
    }
    const savePath = await save({
      defaultPath: defaultPath,
      filters: [{ name: kind.toUpperCase(), extensions: [kind] }]
    })
    if (!savePath) return
    path = savePath
  }

  // 写入文件（以下保持原有逻辑）
  if (kind === 'md') {
    await writeText(path, serializeBook(b))
  } else if (kind === 'txt') {
    await writeText(path, toPlainText(b))
  } else {
    const files: Record<string, Uint8Array> = {}
    // ... 保持原来的 zip 打包代码不变 ...
    files[`${stem}.md`] = strToU8(serializeBook(b))
    files[`${stem}.txt`] = strToU8(toPlainText(b))
    files['book.json'] = strToU8(
      JSON.stringify(
        {
          title: b.title,
          author: b.author,
          volumes: b.volumes.map((v) => ({
            title: v.title,
            chapters: v.chapters.map((c) => ({ title: c.title, content: c.content }))
          }))
        },
        null,
        2
      )
    )
    b.volumes.forEach((v, vi) => {
      v.chapters.forEach((c, ci) => {
        const d = `${String(vi + 1).padStart(3, '0')}-${safeName(v.title)}`
        const n = `${String(ci + 1).padStart(3, '0')}-${safeName(c.title)}.md`
        files[`章节/${d}/${n}`] = strToU8(c.content || '')
      })
    })
    await writeBytes(path, zipSync(files, { level: 6 }))
  }
  
  toast(`已导出到：${path}`)
}
