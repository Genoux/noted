//! Rounds the panel's native corners on macOS.
//!
//! Tauri's blur layer rounds itself with a private `AppKit` call that recent
//! macOS ignores, leaving a square blur behind the rounded page. Clipping the
//! window's content layer (public API) rounds everything inside it at once.

use tauri::{Runtime, WebviewWindow};

/// Matches `border-radius` on `body` in styles.css.
pub const RADIUS: f64 = 18.0;

#[cfg(target_os = "macos")]
#[allow(unsafe_code)]
pub fn round<R: Runtime>(window: &WebviewWindow<R>) {
    use objc2_app_kit::NSWindow;

    let Ok(ptr) = window.ns_window() else { return };
    // SAFETY: `ns_window` returns this window's live NSWindow pointer, and
    // setup runs on the main thread as AppKit requires.
    let ns_window: &NSWindow = unsafe { &*ptr.cast() };
    let Some(view) = ns_window.contentView() else {
        return;
    };
    view.setWantsLayer(true);
    if let Some(layer) = view.layer() {
        layer.setCornerRadius(RADIUS);
        layer.setMasksToBounds(true);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn round<R: Runtime>(_window: &WebviewWindow<R>) {}
