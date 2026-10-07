# Changelog

## [0.1.1] - 2026-10-07

### Fixed

- The standalone binaries crashed on any command that opens the history (downloads and the interface) with "Cannot find module ... better_sqlite3.node". The SQLite native module is now embedded in each binary, and the release pipeline runs the Linux binary without `node_modules` before publishing.

## [0.1.0] - 2026-10-06

First public release.

### Interface

- Terminal interface with search, downloads, history and config tabs, a neon retro theme and a plain one, in English and Brazilian Portuguese.
- Search with pagination, a length filter and an option to hide live, lyrics and karaoke versions. Links to videos, playlists and YouTube Music albums work too.
- Preview tracks with `mpv` or `ffplay` before downloading.
- Pick a destination folder per session, including detected USB drives with their free space, without changing the default folder.
- Unfinished downloads come back the next time you open the app.
- `?` shows every shortcut. Lists accept arrows, `j`/`k`, `g`/`G` and `ctrl+u`/`ctrl+d`.

### Downloads

- MP3, Opus or M4A. Opus and M4A keep the original YouTube audio when the source allows it.
- Tags from YouTube Music metadata, from "Artist - Title" video names, and from MusicBrainz for missing album, year and track number.
- Square cover for YouTube Music tracks, 16:9 cover for regular videos. Opus files get the cover as a FLAC picture block.
- ReplayGain tags, plus R128 for Opus.
- SponsorBlock removes talking and intros. Long mixes can be split into one file per chapter.
- When the destination file already exists, the track is skipped before anything is downloaded.
- Network errors are retried twice with a growing delay.

### Command line

- `get`, `search`, `config`, `history` (with `export`), `deps` and `doctor`.
- `--verbose` writes a debug log with every command run.
- `NO_COLOR` is respected.

### Downloads for this release

The Linux x64 build is tested. The Linux arm64, macOS and Windows builds come from the same pipeline and have not been tried on real machines yet. Check the files against `SHA256SUMS`.
