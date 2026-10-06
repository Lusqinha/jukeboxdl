# jukeboxdl

Baixe músicas do YouTube como MP3 pelo terminal: busca, playlists, tags ID3 com capa e nomes de arquivo configuráveis.

## Instalação

```sh
pnpm install
pnpm build
npm install -g ./apps/cli   # cria o comando `jukeboxdl` (link para apps/cli)
jukeboxdl deps install      # baixa yt-dlp/ffmpeg se faltarem (a interface também oferece)
```

## Uso

### Interface interativa

```sh
jukeboxdl
```

| Aba | Teclas |
|---|---|
| **Buscar** | digite e `enter` para buscar ou colar um link · `↓` resultados · `espaço` marcar · `a` marcar todas · `enter` baixar |
| **Downloads** | `x` cancelar · `X` cancelar todos · `r` tentar de novo · `R` repetir falhas · `c` limpar concluídos |
| **Histórico** | `/` filtrar · `d` remover do histórico |
| **Config** | `enter` editar/alternar · preview ao vivo do template de nome |

Há dois temas: **neon** (padrão, retrô cyberpunk: céu estrelado, painéis chanfrados, barras em LED e um toca-fitas que mostra o download atual) e **classico** (visual simples, melhor em terminais sem cor de 24 bits). Troque na aba Config ou com `jukeboxdl config set theme classico`.

A interface e a CLI estão em **português e inglês**. O idioma vem do sistema (`LANG`), pode ser forçado com `JUKEBOXDL_LANG=en` ou fixado com `jukeboxdl config set language en` (`auto` volta a detectar).

Ao abrir, uma tela de boot animada mostra as etapas do carregamento (qualquer tecla pula a animação quando termina).

`tab`/`shift+tab` ou `1`–`4` trocam de aba (os números valem fora de campos de texto); `esc` volta para Buscar; nas listas, as setas dão a volta nas pontas e `page up`/`page down` pulam uma página; `ctrl+c` sai (pede confirmação se houver downloads em andamento). Faixas já baixadas aparecem com ✓ nos resultados. Em links `watch?v=…&list=…`, só o vídeo vem marcado; `a` marca a playlist inteira.

### Linha de comando

```sh
jukeboxdl get "daft punk aerodynamic"                    # baixa o primeiro resultado
jukeboxdl get <link-video> <link-playlist> -i 1-5,8      # vários links; faixas 1 a 5 e 8 da playlist
jukeboxdl get <link> -o ~/Downloads -t "{artist}/{title}" -b 320 --force
jukeboxdl search -n 5 "alan walker"                      # --json para scripts
jukeboxdl config                                         # mostra tudo
jukeboxdl config set filenameTemplate "{artist}/{album|Singles}/{track:02} - {title}"
jukeboxdl config preview "{playlist}/{index:03} {title}"
jukeboxdl history -s walker
jukeboxdl deps update                                    # atualiza o yt-dlp gerenciado
jukeboxdl doctor
```

`get` sai com código 1 se alguma faixa falhar.

## Requisitos

- Node.js 22 ou superior e pnpm 10 (versões fixadas em `mise.toml`)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (versão recente) e [ffmpeg](https://ffmpeg.org/) com ffprobe: se não estiverem no `PATH`, o jukeboxdl pode baixar builds oficiais (com checksum verificado) para o diretório de dados
- O próprio Node é passado ao yt-dlp como runtime JavaScript (`--js-runtimes`), exigido hoje para extrair do YouTube

## Desenvolvimento

```sh
pnpm install
pnpm dev             # roda a interface a partir do código-fonte (pnpm dev get …, pnpm dev doctor …)
pnpm test            # Vitest
pnpm lint            # Biome
pnpm typecheck
pnpm build           # gera apps/cli/dist
```

### Estrutura

```
apps/cli         CLI (commander) e interface interativa (Ink)
  commands/      subcomandos não interativos
  tui/           telas da interface interativa
  components/    componentes compartilhados (TextInput, barra de progresso, linha de download)
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
  "language": "pt-BR",
  "theme": "neon",
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
