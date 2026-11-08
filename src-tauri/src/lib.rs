use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::Manager;

#[derive(Serialize)]
pub struct Entry {
    name: String,
    path: String,
    is_dir: bool,
}

fn ensure_parent(path: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
    }
    Ok(())
}

#[tauri::command]
fn fs_read_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取失败 {path}: {e}"))
}

#[tauri::command]
fn fs_write_text(path: String, content: String) -> Result<(), String> {
    ensure_parent(&path)?;
    fs::write(&path, content).map_err(|e| format!("写入失败 {path}: {e}"))
}

#[tauri::command]
fn fs_write_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    ensure_parent(&path)?;
    fs::write(&path, bytes).map_err(|e| format!("写入失败 {path}: {e}"))
}

#[tauri::command]
fn fs_read_head(path: String, bytes: usize) -> Result<String, String> {
    let mut file = fs::File::open(&path).map_err(|e| format!("读取失败 {path}: {e}"))?;
    let mut buf = vec![0u8; bytes.max(1)];
    let n = std::io::Read::read(&mut file, &mut buf)
        .map_err(|e| format!("读取失败 {path}: {e}"))?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).to_string())
}

#[tauri::command]
fn fs_remove(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| format!("删除失败 {path}: {e}"))
    } else if p.exists() {
        fs::remove_file(p).map_err(|e| format!("删除失败 {path}: {e}"))
    } else {
        Ok(())
    }
}

#[tauri::command]
fn fs_rename(from: String, to: String) -> Result<(), String> {
    ensure_parent(&to)?;
    fs::rename(&from, &to).map_err(|e| format!("重命名失败 {from} -> {to}: {e}"))
}

#[tauri::command]
fn fs_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
}

#[tauri::command]
fn fs_mkdir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败 {path}: {e}"))
}

#[tauri::command]
fn fs_list(path: String) -> Result<Vec<Entry>, String> {
    let mut out = Vec::new();
    let rd = fs::read_dir(&path).map_err(|e| format!("读取目录失败 {path}: {e}"))?;
    for item in rd.flatten() {
        let p = item.path();
        out.push(Entry {
            name: item.file_name().to_string_lossy().to_string(),
            path: p.to_string_lossy().to_string(),
            is_dir: p.is_dir(),
        });
    }
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    Ok(out)
}

/// 默认书稿根目录：桌面端为「文档/墨匣小说」，安卓为 App 私有文档目录
#[tauri::command]
fn default_book_root<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<String, String> {
    let base = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| format!("定位存储目录失败: {e}"))?;
    let root = base.join("墨匣小说");
    fs::create_dir_all(&root).map_err(|e| format!("创建书稿目录失败: {e}"))?;
    Ok(root.to_string_lossy().to_string())
}

#[tauri::command]
fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            fs_read_text,
            fs_read_head,
            fs_write_text,
            fs_remove,
            fs_rename,
            fs_write_bytes,
            fs_exists,
            fs_mkdir,
            fs_list,
            default_book_root,
            app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
