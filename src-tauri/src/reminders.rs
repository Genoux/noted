//! Fires due reminders as system notifications.

use std::sync::{Mutex, PoisonError};
use std::thread;
use std::time::Duration;

use noted_core::NoteStore;
use noted_core::reminder::{ReminderBook, local_now};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

/// Shared reminder state, managed by Tauri.
#[derive(Debug)]
pub struct Reminders(pub Mutex<ReminderBook>);

impl Reminders {
    pub fn with<T>(&self, f: impl FnOnce(&mut ReminderBook) -> T) -> T {
        f(&mut self.0.lock().unwrap_or_else(PoisonError::into_inner))
    }
}

/// Loads the book and schedules reminders already present in every tab.
pub fn load(store: &NoteStore, path: std::path::PathBuf) -> Reminders {
    let mut book = ReminderBook::load(path);
    let now = local_now();
    for id in store.tabs().unwrap_or_default() {
        if let Ok(text) = store.load(&id)
            && let Err(e) = book.sync(&id, &text, now)
        {
            eprintln!("reminders: could not sync {id}: {e}");
        }
    }
    Reminders(Mutex::new(book))
}

/// Checks once a second for due reminders and notifies.
pub fn start_ticker<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || {
        loop {
            thread::sleep(Duration::from_secs(1));
            let due = app
                .state::<Reminders>()
                .with(|book| book.take_due(local_now()));
            let due = match due {
                Ok(due) if !due.is_empty() => due,
                Ok(_) => continue,
                Err(e) => {
                    eprintln!("reminders: could not save state: {e}");
                    continue;
                }
            };
            for entry in &due {
                if let Err(e) = app
                    .notification()
                    .builder()
                    .title("Noted")
                    .body(&entry.message)
                    .show()
                {
                    eprintln!("reminders: notification failed: {e}");
                }
            }
            let _ = app.emit("reminders-changed", ());
        }
    });
}
