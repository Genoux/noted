//! Tauri shell: wires the window and IPC commands to `noted-core`.

mod panel;

use noted_core::NoteStore;
use tauri::{Manager, State, WindowEvent};

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
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(NoteStore::open(dir)?);

            // Menu bar utility: no Dock icon, no app menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle();
            panel::register_hotkey(handle)?;
            panel::build_tray(handle)?;
            panel::show(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // Clicking anywhere else dismisses the panel, like a popover.
            if let WindowEvent::Focused(false) = event {
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![load_note, save_note])
        .build(tauri::generate_context!());

    match result {
        Ok(app) => app.run(|app, event| {
            // Opening the app again (Spotlight, Finder, `open`) shows the panel.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                panel::show(app);
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        }),
        Err(e) => {
            eprintln!("noted failed to start: {e}");
            std::process::exit(1);
        }
    }
}
