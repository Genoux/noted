//! Linux launchers find Noted's icon by name in the user's icon theme. The
//! release ships only the binary, so the binary keeps those files current:
//! an icon copied there by hand stayed the old one after every update.

use std::path::Path;

const ICONS: [(&str, &[u8]); 2] = [
    ("128x128", include_bytes!("../icons/128x128.png")),
    ("256x256", include_bytes!("../icons/128x128@2x.png")),
];

/// Writes Noted's icons into `data_dir/icons/hicolor`, unless they already match.
pub fn refresh(data_dir: &Path) -> std::io::Result<()> {
    ICONS.iter().try_for_each(|(size, bytes)| {
        let apps = data_dir.join("icons/hicolor").join(size).join("apps");
        let icon = apps.join("noted.png");
        if std::fs::read(&icon).is_ok_and(|current| current == *bytes) {
            return Ok(());
        }
        std::fs::create_dir_all(&apps)?;
        std::fs::write(icon, bytes)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_a_stale_icon_and_adds_missing_sizes() {
        let dir = std::env::temp_dir().join(format!("noted-launcher-icon-{}", std::process::id()));
        let apps = |size: &str| dir.join("icons/hicolor").join(size).join("apps/noted.png");
        std::fs::create_dir_all(apps("128x128").parent().unwrap()).unwrap();
        std::fs::write(apps("128x128"), b"old icon").unwrap();

        refresh(&dir).unwrap();

        for (size, bytes) in ICONS {
            assert!(
                std::fs::read(apps(size)).unwrap() == bytes,
                "{size} not refreshed"
            );
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
