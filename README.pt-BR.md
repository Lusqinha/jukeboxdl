<div align="center">

# jukeboxdl

Baixe músicas do YouTube e do YouTube Music como MP3, Opus ou M4A com tags, por uma interface no terminal ou por comandos.

[![CI](https://github.com/Lusqinha/jukeboxdl/actions/workflows/ci.yml/badge.svg)](https://github.com/Lusqinha/jukeboxdl/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Lusqinha/jukeboxdl)](https://github.com/Lusqinha/jukeboxdl/releases)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

[English](README.md)

</div>

```
 ♪ jukeboxdl   [ 1 buscar ] [ 2 downloads 2 ] [ 3 histórico ] [ 4 config ]    → /run/media/voce/PENDRIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ » ncs alan walker                                                                            │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ // resultados                  20 resultados · até 10 min · sem ao vivo/lyrics · 2 marcadas │
│ ──────────────────────────────────────────────────────────────────────────────────────────── │
│ ❯ ◉ Alan Walker - Fade [NCS Release]                          NoCopyrightSounds    4:21      │
│   ◉ Alan Walker - Spectre [NCS Release]                       NoCopyrightSounds    3:47      │
│   ○ Alan Walker - Force [NCS Release]                         NoCopyrightSounds    4:02      │
│   ○ Alan Walker - Dreamer | House | NCS             ┌────────────────────────────────────────┐│
│   ○ Alan Walker - Sing Me to Sleep                  │ // gravando               [ 1 na fita ]││
│     ▼ 15 abaixo                                     │ (◐)═(◐) Alan Walker - Fade             ││
└─────────────────────────────────────────────────────│ ▃▅▂▇▄▆▂▅ ▰▰▰▰▰▰▰▱▱▱▱▱  58%  2.1 MB/s   │┘
[enter] baixar · [espaço] marcar · [p] ouvir · [c] capítulos · [f/v] filtros · [?] atalhos
```

O jukeboxdl é uma interface para o [yt-dlp](https://github.com/yt-dlp/yt-dlp) e o [ffmpeg](https://ffmpeg.org/). Você busca ou cola um link, escolhe as faixas e recebe os arquivos com o nome e as tags que configurou, com a capa embutida. Ele guarda um histórico para não baixar a mesma faixa duas vezes e lembra a fila que ficou pela metade entre uma sessão e outra.

## O que ele faz

- Busca no YouTube com paginação e filtros de duração e de versões ao vivo/lyrics/karaokê, ou lê links de vídeos, playlists e álbuns do YouTube Music.
- Toca as músicas baixadas, com aleatório e repetir, navegando por álbum, artista ou pasta, e toca prévias dos resultados antes de baixar (precisa do `mpv` ou do `ffplay`).
- Salva em MP3, ou em Opus/M4A quando você quer o áudio original do YouTube sem reconverter.
- Grava tags ID3/Vorbis/MP4. Artista e título vêm dos metadados do YouTube Music quando existem e, se não, do padrão "Artista - Título" no nome do vídeo. Álbum, ano e número da faixa que faltarem podem ser completados pelo MusicBrainz.
- Embute a capa, buscada no Cover Art Archive, no Deezer ou no iTunes quando a faixa é encontrada lá, ou tirada da thumbnail do YouTube. A capa de faixas já baixadas pode ser trocada depois sem mexer no áudio.
- Normaliza o volume para todas as faixas tocarem mais ou menos no mesmo nível (perto de -14 LUFS) e grava tags ReplayGain (R128 no Opus). No MP3 o ajuste acontece na mesma conversão; Opus e M4A são recodificados quando a normalização está ligada.
- Corta falas e introduções com o SponsorBlock e divide mixes longos em um arquivo por capítulo.
- Manda um grupo de downloads para outra pasta ou para um pendrive sem mexer na pasta padrão. Discos removíveis aparecem com o espaço livre.
- Tenta de novo quando a rede falha, confere uma vez por dia se o yt-dlp tem versão nova e atualiza sem sair do app.
- Interface em português e inglês, com um tema neon retrô e outro simples.

## Instalação

### Binário pronto

Baixe o arquivo do seu sistema na [página de releases](https://github.com/Lusqinha/jukeboxdl/releases), dê permissão de execução e coloque em alguma pasta do `PATH`:

```sh
chmod +x jukeboxdl-linux-x64
mv jukeboxdl-linux-x64 ~/.local/bin/jukeboxdl
```

Cada release traz um arquivo `SHA256SUMS` para conferir o download. O binário de Linux x64 foi testado. Os de Linux arm64, macOS e Windows saem do mesmo processo de build, mas ainda não foram usados em máquinas de verdade; se testar, conte como foi.

### A partir do código

Precisa de Node.js 22 e pnpm 10.

```sh
git clone https://github.com/Lusqinha/jukeboxdl.git
cd jukeboxdl
pnpm install
pnpm build
npm install -g ./apps/cli
```

### yt-dlp e ffmpeg

O jukeboxdl usa o `yt-dlp`, o `ffmpeg` e o `ffprobe` que encontrar no `PATH`. Se faltar algum, a primeira execução oferece baixar os builds oficiais para a pasta de dados dele e confere o SHA-256. Também dá para rodar `jukeboxdl deps install`. No macOS não existe build estático oficial do ffmpeg para baixar, então instale com `brew install ffmpeg`.

As versões recentes do yt-dlp precisam de um runtime JavaScript para ler o YouTube. Rodando a partir do código, o jukeboxdl passa o próprio Node. O binário procura `node`, `deno` ou `bun` no `PATH`.

## Uso

### Interface interativa

```sh
jukeboxdl
```

A tela tem uma barra lateral à esquerda (biblioteca, álbuns, artistas, pastas, buscar, downloads, config) e a barra do player embaixo. O `tab` alterna o foco entre a barra lateral e o conteúdo, e os números de `1` a `7` levam direto a cada seção. A qualquer momento, `?` mostra todos os atalhos.

A biblioteca lista as faixas da sua pasta de música e dos destinos que você usou, inclusive um pendrive. Enter numa faixa toca ela e o resto da lista em seguida. O player usa o `mpv` quando ele está instalado; sem ele, o jukeboxdl cai no `ffplay`, em que pausar e avançar reiniciam a faixa na posição atual.

| Onde | Teclas |
|---|---|
| Qualquer tela | `1` a `7` seções · `tab` barra lateral/conteúdo · `d` pasta de destino · `U` atualiza o yt-dlp · `?` ajuda · `q` sai |
| Player | `espaço` pausa/retoma · `>` `<` próxima/anterior · `]` `[` avança/volta 10 s · `+` `-` volume · `S` aleatório · `L` repetir |
| Listas | `↑↓` ou `j` `k` movem · `pgup` `pgdn` ou `ctrl+u` `ctrl+d` pulam · `g` `G` início/fim |
| Biblioteca | `enter` toca a partir daqui · `esc` volta · `/` filtra · `t`/`T` atualiza a capa (uma/todas) · `o` abre a pasta · `r` baixa de novo · `e` exporta CSV · `R` relê as pastas |
| Busca | `enter` baixa · `espaço` marca · `a` marca todas · `p` prévia · `c` divide por capítulos · `f` filtro de duração · `v` esconde ao vivo/lyrics |
| Downloads | `x`/`X` cancelam · `r`/`R` tentam de novo · `c` limpa concluídos · `o` abre a pasta |

### Comandos

```sh
jukeboxdl get "daft punk aerodynamic"               # primeiro resultado da busca
jukeboxdl get <link-da-playlist> -i 1-5,8            # faixas 1 a 5 e 8
jukeboxdl get <link> -o /run/media/voce/PENDRIVE --format opus
jukeboxdl get <link-do-mix> --split-chapters
jukeboxdl search -n 5 "alan walker" --json
jukeboxdl config set filenameTemplate "{artist}/{album|Singles}/{track:02} - {title}"
jukeboxdl config preview "{playlist}/{index:03} {title}"
jukeboxdl history export -f csv -o historico.csv
jukeboxdl covers update --all --source deezer        # troca as capas das faixas já baixadas
jukeboxdl deps update
jukeboxdl doctor
```

O `get` sai com código 1 se alguma faixa falhar. Com `--verbose` em qualquer comando (ou `JUKEBOXDL_DEBUG=1`), o jukeboxdl grava um log com cada comando que executou.

## Configuração

As opções ficam em `~/.config/jukeboxdl/config.json` e podem ser alteradas na aba Config ou com `jukeboxdl config set`. Todos os campos são opcionais:

```json
{
  "language": "pt-BR",
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
  "cover": { "source": "auto" },
  "musicbrainz": true,
  "notifications": true,
  "concurrency": 3,
  "skipDuplicates": true
}
```

`JUKEBOXDL_HOME` junta config, histórico e binários numa pasta só, o que serve para uma instalação portátil. `JUKEBOXDL_LANG=en` força o idioma e `NO_COLOR` desliga as cores.

### Templates de nome

| Sintaxe | Resultado |
|---|---|
| `{title}` | valor da variável |
| `{track:02}` | número com zeros à esquerda (`7` vira `07`) |
| `{album\|Singles}` | valor usado quando a variável está vazia |
| `/` | cria pastas |
| `{{` `}}` | chaves literais |

Variáveis: `title`, `artist`, `album`, `track`, `year`, `playlist`, `index`, `uploader`, `id`. O template precisa ter `{title}` ou `{id}`. Barras dentro dos valores (como em "AC/DC") nunca criam pastas, os caracteres que o Windows e os pendrives em FAT32 recusam são trocados, e os separadores que sobram de variáveis vazias são removidos.

## Problemas comuns

Se os downloads começarem a falhar com erro de extração, o yt-dlp provavelmente está desatualizado. Tecle `U` na interface ou rode `jukeboxdl deps update`; um yt-dlp instalado pelo gerenciador de pacotes precisa ser atualizado por ele.

O `jukeboxdl doctor` mostra quais binários estão em uso e de onde vieram. Para o resto, rode o comando que falhou com `--verbose` e abra o log no caminho que ele mostrar.

## Aviso legal

Baixar conteúdo do YouTube pode violar os termos de uso da plataforma. Use o jukeboxdl para conteúdo que você tem direito de baixar. SponsorBlock e MusicBrainz são serviços de terceiros; com essas opções ligadas, ids de vídeos e nomes de faixas são enviados a eles.

## Desenvolvimento

```sh
pnpm dev            # roda a interface a partir do código
pnpm test           # Vitest
pnpm lint           # Biome
pnpm typecheck
pnpm build:binary   # binário único com Bun
```

O código se divide em `packages/core` (cliente do yt-dlp, tags, fila, histórico, config) e `apps/cli` (comandos e a interface em Ink), para que outra interface possa reaproveitar o core.

## Licença

[MIT](LICENSE)
