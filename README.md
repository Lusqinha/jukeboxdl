<div align="center">

# jukeboxdl

Download music from YouTube and YouTube Music as tagged MP3, Opus or M4A files, from a terminal interface or plain commands.

[![CI](https://github.com/Lusqinha/jukeboxdl/actions/workflows/ci.yml/badge.svg)](https://github.com/Lusqinha/jukeboxdl/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Lusqinha/jukeboxdl)](https://github.com/Lusqinha/jukeboxdl/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[Português](README.pt-BR.md)

</div>

```
 ♪ jukeboxdl   [ 1 search ] [ 2 downloads 2 ] [ 3 history ] [ 4 config ]      → /run/media/you/USB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ » ncs alan walker                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ // results                              20 results · up to 10 min · no live/lyrics · 2 marked │
│ ──────────────────────────────────────────────────────────────────────────────────────────── │
│ ❯ ◉ Alan Walker - Fade [NCS Release]                          NoCopyrightSounds    4:21      │
│   ◉ Alan Walker - Spectre [NCS Release]                       NoCopyrightSounds    3:47      │
│   ○ Alan Walker - Force [NCS Release]                         NoCopyrightSounds    4:02      │
│   ○ Alan Walker - Dreamer | House | NCS             ┌────────────────────────────────────────┐│
│   ○ Alan Walker - Sing Me to Sleep                  │ // recording              [ 1 on tape ]││
│     ▼ 15 below                                      │ (◐)═(◐) Alan Walker - Fade             ││
└─────────────────────────────────────────────────────│ ▃▅▂▇▄▆▂▅ ▰▰▰▰▰▰▰▱▱▱▱▱  58%  2.1 MB/s   │┘
[enter] download · [space] mark · [p] listen · [c] chapters · [f/v] filters · [?] shortcuts
```

jukeboxdl is a front end for [yt-dlp](https://github.com/yt-dlp/yt-dlp) and [ffmpeg](https://ffmpeg.org/). You search or paste a link, pick tracks, and get files named and tagged the way you configured, with the cover embedded. It keeps a history so the same track is not downloaded twice, and it remembers an unfinished queue between sessions.

## What it does

- Search YouTube with pagination and filters for length and live/lyrics/karaoke versions, or paste links to videos, playlists and YouTube Music albums.
- Listen to a preview before downloading (needs `mpv` or `ffplay`).
- Save as MP3, or as Opus/M4A when you want the original YouTube audio without re-encoding.
- Write ID3/Vorbis/MP4 tags. Artist and title come from YouTube Music metadata when it exists, from "Artist - Title" in the video title otherwise, and missing album, year and track number can be filled in from MusicBrainz.
- Embed the cover. Tracks from YouTube Music get a square crop of the album art; regular videos keep the 16:9 frame.
- Normalize the volume so every track plays at about the same level (around -14 LUFS), and write ReplayGain tags (R128 for Opus). For MP3 the adjustment happens in the same conversion; Opus and M4A get re-encoded when normalization is on.
- Cut talking and intros with SponsorBlock, and split long mixes into one file per chapter.
- Send a group of downloads to another folder or a USB drive without touching the default folder. Removable drives are detected with their free space.
- Retry on network errors, check for yt-dlp updates once a day and update it from inside the app.
- Interface in English and Brazilian Portuguese, with a neon retro theme and a plain one.

## Install

### Prebuilt binary

Download the file for your system from the [releases page](https://github.com/Lusqinha/jukeboxdl/releases), make it executable and put it somewhere in your `PATH`:

```sh
chmod +x jukeboxdl-linux-x64
mv jukeboxdl-linux-x64 ~/.local/bin/jukeboxdl
```

Each release has a `SHA256SUMS` file to check the download. The Linux x64 build is tested. The Linux arm64, macOS and Windows builds come from the same pipeline but have not been tried on real machines yet, so reports are welcome.

### From source

You need Node.js 22 and pnpm 10.

```sh
git clone https://github.com/Lusqinha/jukeboxdl.git
cd jukeboxdl
pnpm install
pnpm build
npm install -g ./apps/cli
```

### yt-dlp and ffmpeg

jukeboxdl uses the `yt-dlp`, `ffmpeg` and `ffprobe` it finds in your `PATH`. If any is missing, the first run offers to download the official builds into its data folder and checks their SHA-256. You can also run `jukeboxdl deps install`. On macOS there is no official static ffmpeg build to download, so install it with `brew install ffmpeg`.

Recent yt-dlp versions need a JavaScript runtime to read YouTube. jukeboxdl passes Node to it when running from source. The standalone binary looks for `node`, `deno` or `bun` in your `PATH`.

## Usage

### Interactive

```sh
jukeboxdl
```

Type a search and press enter, move to the results with `↓`, mark tracks with space and press enter to download. Press `?` at any time for the full list of shortcuts.

| Where | Keys |
|---|---|
| Anywhere | `tab` or `1` to `4` switch tabs · `/` go to search · `esc` back to search · `d` destination folder · `U` update yt-dlp · `?` help · `q` quit |
| Lists | `↑↓` or `j` `k` move · `pgup` `pgdn` or `ctrl+u` `ctrl+d` jump · `g` `G` first/last |
| Search | `enter` download · `space` mark · `a` mark all · `p` preview · `c` split by chapters · `f` length filter · `v` hide live/lyrics |
| Downloads | `x`/`X` cancel · `r`/`R` retry · `c` clear finished · `o` open folder |
| History | `/` filter · `o` open folder · `r` download again · `e` export CSV · `d` remove entry |

### Commands

```sh
jukeboxdl get "daft punk aerodynamic"               # first search result
jukeboxdl get <playlist-url> -i 1-5,8                # tracks 1 to 5 and 8
jukeboxdl get <url> -o /run/media/you/USB --format opus
jukeboxdl get <mix-url> --split-chapters
jukeboxdl search -n 5 "alan walker" --json
jukeboxdl config set filenameTemplate "{artist}/{album|Singles}/{track:02} - {title}"
jukeboxdl config preview "{playlist}/{index:03} {title}"
jukeboxdl history export -f csv -o history.csv
jukeboxdl deps update
jukeboxdl doctor
```

`get` exits with code 1 if any track fails. Add `--verbose` to any command (or set `JUKEBOXDL_DEBUG=1`) to write a debug log with every command jukeboxdl runs.

## Configuration

Settings live in `~/.config/jukeboxdl/config.json` and can be changed from the Config tab or with `jukeboxdl config set`. Every field is optional:

```json
{
  "language": "en",
  "theme": "neon",
  "outputDir": "~/Music",
  "filenameTemplate": "{artist} - {title}",
  "playlistTemplate": "{playlist}/{index:03} - {artist} - {title}",
  "audio": {
    "format": "mp3",
    "bitrate": 192,
    "embedCover": true,
    "removeNonMusic": true,
    "normalize": true,
    "replayGain": true
  },
  "musicbrainz": true,
  "notifications": true,
  "concurrency": 3,
  "skipDuplicates": true
}
```

`JUKEBOXDL_HOME` puts config, history and managed binaries in a single folder, which is handy for a portable setup. `JUKEBOXDL_LANG=en` forces the language. `NO_COLOR` turns colors off.

### File name templates

| Syntax | Result |
|---|---|
| `{title}` | the variable's value |
| `{track:02}` | zero padded number (`7` becomes `07`) |
| `{album\|Singles}` | fallback when the variable is empty |
| `/` | creates folders |
| `{{` `}}` | literal braces |

Variables: `title`, `artist`, `album`, `track`, `year`, `playlist`, `index`, `uploader`, `id`. A template must contain `{title}` or `{id}`. Slashes inside values (as in "AC/DC") never create folders, characters that Windows and FAT32 drives reject are replaced, and separators left over by empty variables are removed.

## Troubleshooting

If downloads start failing with extraction errors, yt-dlp is probably out of date. Press `U` in the interface or run `jukeboxdl deps update`; a yt-dlp installed by your package manager has to be updated there.

`jukeboxdl doctor` shows which binaries are in use and where they came from. For anything else, run the failing command with `--verbose` and look at the log path it prints.

## Legal notice

Downloading from YouTube may go against its terms of service. Use jukeboxdl for content you have the right to download. SponsorBlock and MusicBrainz are third-party services; turning those options on sends video ids and track names to them.

## Development

```sh
pnpm dev            # run the interface from source
pnpm test           # Vitest
pnpm lint           # Biome
pnpm typecheck
pnpm build:binary   # standalone binary with Bun
```

The code is split into `packages/core` (yt-dlp client, tagging, queue, history, config) and `apps/cli` (commands and the Ink interface), so another front end can reuse the core.

## License

[MIT](LICENSE)
