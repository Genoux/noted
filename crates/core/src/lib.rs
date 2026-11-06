//! Platform-independent logic for Noted.
//!
//! Nothing in this crate knows about windows, hotkeys or the webview, so it
//! can be tested with plain `cargo test` on any OS.

pub mod store;

pub use store::NoteStore;
