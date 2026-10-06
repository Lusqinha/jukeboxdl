# jukeboxdl

Baixe músicas do YouTube como MP3 pelo terminal: busca, playlists, tags ID3 com capa e nomes de arquivo configuráveis.

> Em desenvolvimento. Por enquanto só existe o comando `doctor`.

## Requisitos

- Node.js 22 ou superior e pnpm 10 (versões fixadas em `mise.toml`)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (versão recente) e [ffmpeg](https://ffmpeg.org/) com ffprobe: se não estiverem no `PATH`, o jukeboxdl pode baixar builds oficiais (com checksum verificado) para o diretório de dados
- O próprio Node é passado ao yt-dlp como runtime JavaScript (`--js-runtimes`), exigido hoje para extrair do YouTube

## Desenvolvimento

```sh
pnpm install
pnpm dev doctor      # roda a CLI a partir do código-fonte
pnpm test            # Vitest
pnpm lint            # Biome
pnpm typecheck
pnpm build           # gera apps/cli/dist
```

### Estrutura

```
apps/cli         CLI (commander + Ink)
packages/core    lógica independente de interface
  ytdlp/         cliente do yt-dlp (busca, links, download com progresso)
  tags/          metadados a partir do vídeo e gravação de ID3 + capa via ffmpeg
  download/      pipeline de uma faixa e fila com concorrência/cancelamento
  history/       histórico em SQLite (pula faixas já baixadas)
  jukebox.ts     fachada usada pelas interfaces
```

Arquivos de destino existentes nunca são sobrescritos. O histórico fica em `~/.local/share/jukeboxdl/history.db`, e uma faixa só é pulada se o arquivo registrado ainda existir.

O `core` é consumido direto do código-fonte pelos bundlers (tsup, tsx, Vitest), então não tem etapa de build própria.

## Configuração

Arquivo `~/.config/jukeboxdl/config.json` (respeita `XDG_CONFIG_HOME`; `JUKEBOXDL_HOME` coloca tudo num único diretório). Todos os campos são opcionais:

```json
{
  "outputDir": "~/Music",
  "filenameTemplate": "{artist} - {title}",
  "playlistTemplate": "{playlist}/{index:03} - {artist} - {title}",
  "audio": { "bitrate": 192, "embedCover": true },
  "concurrency": 3,
  "skipDuplicates": true,
  "binaries": { "ytDlp": "/caminho/yt-dlp", "ffmpeg": "/caminho/ffmpeg" }
}
```

### Templates de nome

| Sintaxe | Significado |
|---|---|
| `{title}` | valor da variável |
| `{track:02}` | número com zeros à esquerda (`7` → `07`) |
| `{album\|Singles}` | valor padrão se a variável estiver vazia |
| `/` | cria pastas |
| `{{` `}}` | chaves literais |

Variáveis: `title`, `artist`, `album`, `track`, `year`, `playlist`, `index`, `uploader`, `id`. O template precisa conter `{title}` ou `{id}`.

Os nomes ficam seguros em qualquer sistema: barras nos valores (`AC/DC`) não criam pastas, caracteres inválidos são trocados e separadores que sobram de variáveis vazias são removidos.

## Aviso

Baixar conteúdo do YouTube pode violar os termos de uso da plataforma. Use apenas para conteúdo que você tem direito de baixar.
