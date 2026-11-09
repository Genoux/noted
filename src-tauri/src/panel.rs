//! The floating panel: summon/dismiss, global hotkey and menu bar icon.

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
#[cfg(target_os = "linux")]
use tauri::tray::{MouseButton, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Runtime, WebviewWindow, WindowEvent};
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
        // The page focuses the editor on this; WebKitGTK doesn't always fire
        // a window focus event when a hidden window comes back.
        let _ = w.emit("panel-shown", ());
    }
}

/// Closing the window (e.g. the compositor's close key) only hides the
/// panel, so the next summon brings back the same loaded page. Losing focus
/// does nothing: with focus-follows-mouse, moving the pointer away would hide it.
pub fn hide_on_close<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = window(app) else { return };
    let panel = w.clone();
    w.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = panel.hide();
        }
    });
}

/// Hides the focused panel; otherwise brings it up with focus.
pub fn toggle<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = window(app) else { return };
    let visible = w.is_visible().unwrap_or(false);
    if visible && w.is_focused().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    if visible {
        // Open behind another window. Wayland ignores an app's own focus
        // request, but compositors focus a window as it maps: remap it.
        let _ = w.hide();
    }
    show(app);
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

    let mut tray = TrayIconBuilder::new()
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
    // macOS opens the menu on a left click, like every menu bar icon; Linux
    // trays leave the menu to the right click, so the left click opens Noted.
    #[cfg(target_os = "linux")]
    {
        tray = tray.on_tray_icon_event(|icon, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                show(icon.app_handle());
            }
        });
    }
    // macOS tints a template image to match the menu bar; Linux bars are dark.
    #[cfg(target_os = "macos")]
    {
        tray = tray
            .icon(Image::from_bytes(include_bytes!(
                "../icons/tray-template.png"
            ))?)
            .icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        tray = tray.icon(Image::from_bytes(include_bytes!(
            "../icons/tray-light.png"
        ))?);
    }
    tray.build(app)?;
    Ok(())
}
