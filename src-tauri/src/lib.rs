//! Tauri shell: wires the window and IPC commands to `noted-core`.

use noted_core::NoteStore;
use tauri::{Manager, State};

/// Errors crossing the IPC boundary are sent to the frontend as strings.
type CmdResult<T> = Result<T, String>;

#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri injects `State` by value.
fn load_note(store: State<'_, NoteStore>) -> CmdResult<String> {
    store.load().map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)] // Tauri injects `State` by value.
fn save_note(store: State<'_, NoteStore>, text: &str) -> CmdResult<()> {
    store.save(text).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(NoteStore::open(dir)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_note, save_note])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("noted failed to start: {e}");
        std::process::exit(1);
    }
}
