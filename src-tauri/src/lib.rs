//! Tauri shell: wires the window and IPC commands to `noted-core`.

mod corners;
#[cfg(target_os = "linux")]
mod launcher_icon;
mod panel;
mod reminders;
mod remote;

use noted_core::NoteStore;
use noted_core::reminder::{Entry, local_now};
use reminders::Reminders;
use tauri::{AppHandle, Manager, State};

/// Errors crossing the IPC boundary are sent to the frontend as strings.
type CmdResult<T> = Result<T, String>;

fn ipc<T>(result: noted_core::store::Result<T>) -> CmdResult<T> {
    result.map_err(|e| e.to_string())
}

// Tauri injects `State` by value, hence the allows below.

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn list_tabs(store: State<'_, NoteStore>) -> CmdResult<Vec<String>> {
    ipc(store.tabs())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn load_note(store: State<'_, NoteStore>, id: &str) -> CmdResult<String> {
    ipc(store.load(id))
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn save_note(
    store: State<'_, NoteStore>,
    reminders: State<'_, Reminders>,
    id: &str,
    text: &str,
) -> CmdResult<()> {
    ipc(store.save(id, text))?;
    reminders
        .with(|book| book.sync(id, text, local_now()))
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn create_tab(store: State<'_, NoteStore>) -> CmdResult<String> {
    ipc(store.create())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn close_tab(
    store: State<'_, NoteStore>,
    reminders: State<'_, Reminders>,
    id: &str,
) -> CmdResult<()> {
    ipc(store.close(id))?;
    reminders
        .with(|book| book.forget(id))
        .map_err(|e| e.to_string())
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn tab_reminders(reminders: State<'_, Reminders>, id: &str) -> Vec<Entry> {
    reminders.with(|book| book.for_tab(id))
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn tray_visible(app: AppHandle) -> bool {
    app.tray_by_id(panel::TRAY_ID).is_some()
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
fn set_tray_visible(app: AppHandle, store: State<'_, NoteStore>, visible: bool) -> CmdResult<()> {
    let needs_tray = visible && app.tray_by_id(panel::TRAY_ID).is_none();
    if needs_tray {
        panel::build_tray(&app).map_err(|e| e.to_string())?;
    }
    if let Err(e) = store.set_tray_visible(visible) {
        if needs_tray {
            app.remove_tray_by_id(panel::TRAY_ID);
        }
        return Err(e.to_string());
    }
    if !visible {
        app.remove_tray_by_id(panel::TRAY_ID);
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Already running: toggle that panel and exit before Tauri starts.
    if remote::toggle_running() {
        return;
    }
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        // Remembers where the panel was and how big, like Wisp.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::SIZE,
                )
                .build(),
        )
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let store = NoteStore::open(&dir).map_err(|e| e.to_string())?;
            let tray_visible = store.tray_visible().unwrap_or(true);
            app.manage(reminders::load(&store, dir.join("reminders.json")));
            app.manage(store);
            reminders::start_ticker(app.handle().clone());

            #[cfg(target_os = "linux")]
            if let Err(e) = launcher_icon::refresh(&app.path().data_dir()?) {
                eprintln!("could not refresh the launcher icon: {e}");
            }

            // Menu bar utility: no Dock icon, no app menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Some(window) = app.get_webview_window("main") {
                corners::round(&window);
            }

            let handle = app.handle();
            panel::register_hotkey(handle)?;
            panel::register_tray_menu(handle);
            if tray_visible {
                panel::build_tray(handle)?;
            }
            panel::hide_on_close(handle);
            remote::listen(handle);
            // `noted --hidden` (e.g. at login) loads the panel off screen, so
            // the first hotkey press shows it instantly instead of cold-starting.
            if !std::env::args().any(|a| a == "--hidden") {
                panel::show(handle);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_tabs,
            load_note,
            save_note,
            create_tab,
            close_tab,
            tab_reminders,
            tray_visible,
            set_tray_visible,
        ])
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
