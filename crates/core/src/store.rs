//! On-disk storage for notes as plain markdown files.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

const NOTE_FILE: &str = "scratchpad.md";

/// Reads and writes notes inside a single directory.
#[derive(Debug, Clone)]
pub struct NoteStore {
    dir: PathBuf,
}

impl NoteStore {
    /// Opens a store rooted at `dir`, creating the directory if needed.
    pub fn open(dir: impl Into<PathBuf>) -> io::Result<Self> {
        let dir = dir.into();
        fs::create_dir_all(&dir)?;
        Ok(Self { dir })
    }

    /// Path of the note file on disk.
    #[must_use]
    pub fn note_path(&self) -> PathBuf {
        self.dir.join(NOTE_FILE)
    }

    /// Returns the note's contents, or an empty string if it does not exist yet.
    pub fn load(&self) -> io::Result<String> {
        match fs::read_to_string(self.note_path()) {
            Ok(text) => Ok(text),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(String::new()),
            Err(e) => Err(e),
        }
    }

    /// Saves the note atomically: a crash mid-write never leaves a partial file.
    pub fn save(&self, text: &str) -> io::Result<()> {
        write_atomic(&self.note_path(), text.as_bytes())
    }
}

/// Writes to a sibling temp file, syncs it, then renames it over `path`.
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("md.tmp");
    {
        let mut file = fs::File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    fs::rename(&tmp, path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, NoteStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = NoteStore::open(dir.path().join("notes")).unwrap();
        (dir, store)
    }

    #[test]
    fn missing_note_loads_empty() {
        let (_dir, store) = store();
        assert_eq!(store.load().unwrap(), "");
    }

    #[test]
    fn save_then_load_round_trips() {
        let (_dir, store) = store();
        store.save("# idea\n- [ ] ship it\n").unwrap();
        assert_eq!(store.load().unwrap(), "# idea\n- [ ] ship it\n");
    }

    #[test]
    fn save_overwrites_and_leaves_no_temp_file() {
        let (_dir, store) = store();
        store.save("first").unwrap();
        store.save("second").unwrap();
        assert_eq!(store.load().unwrap(), "second");
        assert!(!store.note_path().with_extension("md.tmp").exists());
    }
}
