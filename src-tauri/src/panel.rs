//! The floating panel: summon/dismiss, global hotkey and menu bar icon.

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

const MAIN: &str = "main";

fn window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window(MAIN)
}

/// Brings the panel to the front and focuses the editor.
pub fn show<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = window(app) {
        let _ = w.show();
        let _ = w.set_focus();
        // The page fades itself in on this.
        let _ = w.emit("panel-shown", ());
    }
}

/// Hides the panel if visible, otherwise shows it.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = window(app) else { return };
    if w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
    } else {
        show(app);
    }
}

/// Registers ⌥Space (Alt+Space) to toggle the panel from anywhere.
pub fn register_hotkey<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let hotkey = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    app.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |app, shortcut, event| {
                if *shortcut == hotkey && event.state() == ShortcutState::Pressed {
                    toggle(app);
                }
            })
            .build(),
    )?;
    if let Err(e) = app.global_shortcut().register(hotkey) {
        // Another app may own the key; the menu bar icon still works.
        eprintln!("could not register ⌥Space: {e}");
    }
    Ok(())
}

/// Adds the menu bar icon with Show and Quit.
pub fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show Noted   ⌥Space", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit Noted", true, Some("CmdOrCtrl+Q"))?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let mut tray = TrayIconBuilder::with_id("tray")
        .tooltip("Noted")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show(app),
            "quit" => {
                // Keep the panel's position and size for next launch.
                let _ = app.save_window_state(StateFlags::POSITION | StateFlags::SIZE);
                app.exit(0);
            }
            _ => {}
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
