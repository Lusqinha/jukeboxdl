# Changelog

## [0.2.0] - 2026-10-07

### Player and navigation

- jukeboxdl now plays the music it downloaded. The player bar stays at the bottom of the screen: space pauses, `<` and `>` change tracks, `[` and `]` seek 10 seconds, `-` and `+` change the volume, `S` turns shuffle on and `L` cycles repeat.
- Playback uses mpv when it is installed. Without it, jukeboxdl uses ffplay, which has no remote control, so pausing, seeking and changing the volume restart the track at the current position. The mpv engine follows mpv's IPC documentation but has not been run on a real machine yet.
- The screen now has a sidebar with library, albums, artists, folders, search, downloads and config. `tab` moves the focus between the sidebar and the content, and `1` to `7` jump to a section.
- The library reads the default music folder and every destination you used before, USB drives included. Tags are cached in SQLite, so the next scan only reads new or changed files.
- The library replaces the history tab. Cover updates, downloading again and CSV export moved there.

### Covers

- New `cover.source` setting. With `auto`, the default, jukeboxdl tries the Cover Art Archive through MusicBrainz, then Deezer, and uses the YouTube thumbnail when neither has the track. `musicbrainz`, `deezer`, `itunes` and `youtube` limit it to one source. A cover is used only when its title and artist match the track.
- Covers of tracks already on disk can be replaced without touching the audio or the tags: `jukeboxdl covers update <files>`, `--all` for the whole history, or `t` and `T` in the library.

### Downloads

- Volume normalization is on by default and brings every track to about -14 LUFS, with peaks kept under -1.5 dBTP. MP3 files get it in the conversion yt-dlp already does. Opus and M4A files have to be re-encoded for it; turn `audio.normalize` off to keep the original stream.

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
