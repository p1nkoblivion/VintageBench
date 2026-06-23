# Vintage Story Crash Safety and Backups

Modified for Vintage Bench on 2026-06-23: this document records the crash-safety pass for linked Vintage Story files.

## Recovery Layers

Vintage Bench now has two separate recovery layers:

- Project autosave and crash recovery use the existing IndexedDB `AutoBackup` system. It writes periodic project snapshots and shows recovery on startup when autosaves exist.
- Linked Vintage Story files use timestamped `.bak` files created before overwrites. This covers item/block assets, shape files, lang files, modinfo, copied textures, and export/package writes that use the Vintage Story write helpers.

The Help > Backups menu includes:

- View Backups: existing desktop project backup folder browser.
- Recover Autosaved Projects: opens the IndexedDB autosave recovery dialog even after the start screen prompt is gone.
- Vintage Story Backups: scans the current workspace and linked asset folders for `.bak` files.

## Timestamped File Backups

Vintage Story backup files are written next to the file being overwritten:

`<target path>.<yyyymmddhhmmss>.bak`

If the same file is overwritten more than once in the same second, Vintage Bench appends a sequence number before `.bak` instead of replacing the previous backup:

`<target path>.<yyyymmddhhmmss>.1.bak`

Restoring a backup creates another pre-restore backup of the current file before copying the selected backup over it.

## Restore and Compare UI

The Vintage Story Backups dialog supports:

- Restore Backup
- Compare with Backup
- Open Backup Folder

Compare is intentionally text-only and size-limited. It is meant for JSON assets, shapes, lang files, and modinfo. Binary copied textures can still be restored or opened in the folder, but they are not text-compared.

## Export Rollback

The mod export report now distinguishes:

- `created`: files that did not exist before export
- `overwritten`: files that existed and were backed up before export
- `backups`: backup files available for restore
- `failed`: entries that could not be written or copied

If an export partially fails, the report keeps failed files dirty and offers a rollback action. Rollback restores overwritten files from the backups created by that export and can remove files that were newly created by that same export.

## Legal Asset Safety

Backups are local safety copies of files the user is editing or exporting in their workspace. Vintage Bench does not create bundled proprietary Vintage Story asset copies in the repository, generated declarations, or release packages as part of this recovery system.
