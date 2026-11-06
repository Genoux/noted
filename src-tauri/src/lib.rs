//! Tauri shell: wires the window and IPC commands to `noted-core`.

mod panel;
mod reminders;

use noted_core::NoteStore;
use noted_core::reminder::{Entry, local_now};
use reminders::Reminders;
use tauri::{Manager, State};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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
            app.manage(reminders::load(&store, dir.join("reminders.json")));
            app.manage(store);
            reminders::start_ticker(app.handle().clone());

            // Menu bar utility: no Dock icon, no app menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle();
            panel::register_hotkey(handle)?;
            panel::build_tray(handle)?;
            panel::show(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_tabs,
            load_note,
            save_note,
            create_tab,
            close_tab,
            tab_reminders,
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
