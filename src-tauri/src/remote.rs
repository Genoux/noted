//! Running `noted` while it's already open toggles the panel.
//!
//! Wayland gives apps no global hotkeys, so a compositor bind that runs
//! `noted` is the hotkey there. That launch must be near-instant: it checks a
//! Unix socket before Tauri or GTK start, sends "toggle" and exits. Only the
//! first instance gets past the check and listens on the socket.

use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;

use tauri::{AppHandle, Runtime};

use crate::panel;

const TOGGLE: &[u8] = b"toggle";

fn socket_path() -> PathBuf {
    // Per-user on both platforms: XDG_RUNTIME_DIR on Linux, $TMPDIR on macOS.
    std::env::var_os("XDG_RUNTIME_DIR")
        .map_or_else(std::env::temp_dir, PathBuf::from)
        .join("noted.sock")
}

/// Asks a running Noted to toggle its panel. False when none is running.
pub fn toggle_running() -> bool {
    UnixStream::connect(socket_path())
        .and_then(|mut stream| stream.write_all(TOGGLE))
        .is_ok()
}

/// Listens for later launches and toggles the panel for each.
pub fn listen<R: Runtime>(app: &AppHandle<R>) {
    let path = socket_path();
    // Nothing answered `toggle_running`, so a leftover file is stale.
    let _ = std::fs::remove_file(&path);
    let listener = match UnixListener::bind(&path) {
        Ok(listener) => listener,
        Err(e) => {
            eprintln!("could not listen on {}: {e}", path.display());
            return;
        }
    };
    let app = app.clone();
    std::thread::spawn(move || {
        for mut stream in listener.incoming().flatten() {
            let mut message = Vec::new();
            if stream.read_to_end(&mut message).is_ok() && message == TOGGLE {
                let handle = app.clone();
                let _ = app.run_on_main_thread(move || panel::toggle(&handle));
            }
        }
    });
}
