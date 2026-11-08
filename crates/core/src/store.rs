//! On-disk storage: one markdown file per tab, plus the tab order.
//!
//! Layout under the store root:
//! ```text
//! notes/<id>.md     one file per tab
//! notes/tabs.json   tab order (rebuilt from the files if missing or stale)
//! .trash/           closed tabs, never deleted outright
//! ```

use std::fmt;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, PoisonError};
use std::time::{SystemTime, UNIX_EPOCH};

const NOTES_DIR: &str = "notes";
const TRASH_DIR: &str = ".trash";
const ORDER_FILE: &str = "tabs.json";
/// Single-note file from before tabs existed; becomes the first tab.
const LEGACY_NOTE: &str = "scratchpad.md";
const MAX_ID_LEN: usize = 64;

#[derive(Debug)]
pub enum StoreError {
    Io(io::Error),
    /// The id could escape the notes folder or is otherwise malformed.
    InvalidId(String),
    NotFound(String),
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(e) => write!(f, "{e}"),
            Self::InvalidId(id) => write!(f, "invalid tab id: {id:?}"),
            Self::NotFound(id) => write!(f, "tab not found: {id}"),
        }
    }
}

impl std::error::Error for StoreError {}

impl From<io::Error> for StoreError {
    fn from(e: io::Error) -> Self {
        Self::Io(e)
    }
}

pub type Result<T> = std::result::Result<T, StoreError>;

/// Reads and writes tabs inside a single directory.
#[derive(Debug)]
pub struct NoteStore {
    root: PathBuf,
    /// Serialises read-modify-write of the order file.
    order_lock: Mutex<()>,
}

impl NoteStore {
    /// Opens a store rooted at `root`, creating folders and migrating the
    /// legacy single note if needed.
    pub fn open(root: impl Into<PathBuf>) -> Result<Self> {
        let store = Self {
            root: root.into(),
            order_lock: Mutex::new(()),
        };
        fs::create_dir_all(store.notes_dir())?;
        let legacy = store.root.join(LEGACY_NOTE);
        let migrated = store.notes_dir().join(LEGACY_NOTE);
        if legacy.is_file() && !migrated.exists() {
            fs::rename(legacy, migrated)?;
        }
        Ok(store)
    }

    fn notes_dir(&self) -> PathBuf {
        self.root.join(NOTES_DIR)
    }

    fn note_path(&self, id: &str) -> Result<PathBuf> {
        validate_id(id)?;
        Ok(self.notes_dir().join(format!("{id}.md")))
    }

    /// Tab ids in display order. Always returns at least one tab.
    pub fn tabs(&self) -> Result<Vec<String>> {
        let _guard = self
            .order_lock
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let ids = self.ordered_ids()?;
        if ids.is_empty() {
            let id = self.create_locked(&ids)?;
            return Ok(vec![id]);
        }
        Ok(ids)
    }

    /// Returns a tab's contents.
    pub fn load(&self, id: &str) -> Result<String> {
        match fs::read_to_string(self.note_path(id)?) {
            Ok(text) => Ok(text),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Err(StoreError::NotFound(id.into())),
            Err(e) => Err(e.into()),
        }
    }

    /// Saves a tab atomically: a crash mid-write never leaves a partial file.
    pub fn save(&self, id: &str, text: &str) -> Result<()> {
        let path = self.note_path(id)?;
        if !path.is_file() {
            return Err(StoreError::NotFound(id.into()));
        }
        write_atomic(&path, text.as_bytes())?;
        Ok(())
    }

    /// Creates an empty tab at the end and returns its id.
    pub fn create(&self) -> Result<String> {
        let _guard = self
            .order_lock
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        let ids = self.ordered_ids()?;
        self.create_locked(&ids)
    }

    /// Closes a tab by moving its file to the trash folder.
    pub fn close(&self, id: &str) -> Result<()> {
        let path = self.note_path(id)?;
        let _guard = self
            .order_lock
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        if !path.is_file() {
            return Err(StoreError::NotFound(id.into()));
        }
        let trash = self.root.join(TRASH_DIR);
        fs::create_dir_all(&trash)?;
        fs::rename(&path, trash.join(format!("{id}-{}.md", unique_stamp())))?;
        let ids: Vec<String> = self.ordered_ids()?;
        self.write_order(&ids)
    }

    fn create_locked(&self, ids: &[String]) -> Result<String> {
        let base = format!("note-{}", unique_stamp());
        let mut id = base.clone();
        let mut n = 1;
        while self.note_path(&id)?.exists() {
            id = format!("{base}-{n}");
            n += 1;
        }
        write_atomic(&self.note_path(&id)?, b"")?;
        let mut next = ids.to_vec();
        next.push(id.clone());
        self.write_order(&next)?;
        Ok(id)
    }

    /// Saved order, minus tabs whose file is gone, plus files not yet listed.
    fn ordered_ids(&self) -> Result<Vec<String>> {
        let mut on_disk = Vec::new();
        for entry in fs::read_dir(self.notes_dir())? {
            let name = entry?.file_name();
            let Some(id) = name.to_str().and_then(|n| n.strip_suffix(".md")) else {
                continue;
            };
            if validate_id(id).is_ok() {
                on_disk.push(id.to_owned());
            }
        }
        on_disk.sort();

        let saved: Vec<String> = fs::read(self.notes_dir().join(ORDER_FILE))
            .ok()
            .and_then(|bytes| serde_json::from_slice(&bytes).ok())
            .unwrap_or_default();

        let mut ids: Vec<String> = saved
            .into_iter()
            .filter(|id| on_disk.contains(id))
            .collect();
        for id in on_disk {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
        Ok(ids)
    }

    fn write_order(&self, ids: &[String]) -> Result<()> {
        let json = serde_json::to_vec_pretty(ids).map_err(io::Error::from)?;
        write_atomic(&self.notes_dir().join(ORDER_FILE), &json)?;
        Ok(())
    }
}

/// Ids come from the UI, so they must not be able to name paths.
fn validate_id(id: &str) -> Result<()> {
    let ok = !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && !id.starts_with('-');
    if ok {
        Ok(())
    } else {
        Err(StoreError::InvalidId(id.into()))
    }
}

/// Milliseconds since the epoch, bumped past the last stamp so two calls in the
/// same millisecond (or after a clock step back) never collide: a reused stamp
/// would revive a closed tab's id or overwrite its file in the trash.
fn unique_stamp() -> u64 {
    static LAST: AtomicU64 = AtomicU64::new(0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| u64::try_from(d.as_millis()).unwrap_or(u64::MAX));
    let previous = LAST
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |last| {
            Some(now.max(last + 1))
        })
        .unwrap_or_else(|last| last);
    now.max(previous + 1)
}

/// Writes to a sibling temp file, syncs it, then renames it over `path`.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
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
        let store = NoteStore::open(dir.path()).unwrap();
        (dir, store)
    }

    #[test]
    fn empty_store_gets_one_tab() {
        let (_dir, store) = store();
        let tabs = store.tabs().unwrap();
        assert_eq!(tabs.len(), 1);
        assert_eq!(store.load(&tabs[0]).unwrap(), "");
        assert_eq!(store.tabs().unwrap(), tabs, "stable across calls");
    }

    #[test]
    fn legacy_note_becomes_first_tab() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join(LEGACY_NOTE), "old note").unwrap();
        let store = NoteStore::open(dir.path()).unwrap();
        assert_eq!(store.tabs().unwrap(), ["scratchpad"]);
        assert_eq!(store.load("scratchpad").unwrap(), "old note");
        assert!(!dir.path().join(LEGACY_NOTE).exists());
    }

    #[test]
    fn save_then_load_round_trips() {
        let (_dir, store) = store();
        let id = &store.tabs().unwrap()[0];
        store.save(id, "# idea\n- [ ] ship it\n").unwrap();
        assert_eq!(store.load(id).unwrap(), "# idea\n- [ ] ship it\n");
    }

    #[test]
    fn create_appends_and_close_trashes() {
        let (dir, store) = store();
        let first = store.tabs().unwrap()[0].clone();
        let second = store.create().unwrap();
        assert_eq!(store.tabs().unwrap(), [first.clone(), second.clone()]);

        store.save(&second, "keep me").unwrap();
        store.close(&second).unwrap();
        assert_eq!(store.tabs().unwrap(), [first]);

        let trashed: Vec<_> = fs::read_dir(dir.path().join(TRASH_DIR)).unwrap().collect();
        assert_eq!(trashed.len(), 1);
        let text = fs::read_to_string(trashed[0].as_ref().unwrap().path()).unwrap();
        assert_eq!(text, "keep me");
    }

    #[test]
    fn closing_last_tab_leaves_a_fresh_one() {
        let (_dir, store) = store();
        let only = store.tabs().unwrap()[0].clone();
        store.close(&only).unwrap();
        let tabs = store.tabs().unwrap();
        assert_eq!(tabs.len(), 1);
        assert_ne!(tabs[0], only);
    }

    #[test]
    fn order_survives_a_corrupt_order_file() {
        let (dir, store) = store();
        let a = store.tabs().unwrap()[0].clone();
        let b = store.create().unwrap();
        fs::write(dir.path().join(NOTES_DIR).join(ORDER_FILE), "not json").unwrap();
        let mut expected = vec![a, b];
        expected.sort();
        assert_eq!(store.tabs().unwrap(), expected);
    }

    #[test]
    fn rejects_ids_that_could_escape_the_folder() {
        let (_dir, store) = store();
        for bad in [
            "",
            "../x",
            "a/b",
            ".hidden",
            "-x",
            "UPPER",
            "a.md",
            &"a".repeat(65),
        ] {
            assert!(
                matches!(store.save(bad, "x"), Err(StoreError::InvalidId(_))),
                "{bad:?} should be rejected"
            );
        }
    }

    #[test]
    fn saving_unknown_tab_fails_instead_of_creating() {
        let (_dir, store) = store();
        assert!(matches!(
            store.save("ghost", "x"),
            Err(StoreError::NotFound(_))
        ));
    }
}
