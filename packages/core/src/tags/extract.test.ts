import { describe, expect, it } from "vitest";
import { cleanChannel, cleanTitle, metadataFromInfo, splitArtistTitle } from "./extract";

describe("cleanTitle", () => {
  it.each([
    ["Song (Official Video)", "Song"],
    ["Song [Official Music Video]", "Song"],
    ["Song (Lyric Video) [HD]", "Song"],
    ["Música (Clipe Oficial)", "Música"],
    ["Fade [COPYRIGHTED NCS Release]", "Fade"],
    ["Song (Remix) (Official Audio)", "Song (Remix)"],
    ["Song (feat. Someone)", "Song (feat. Someone)"],
    ["Song (Live)", "Song (Live)"],
  ])("%j → %j", (input, expected) => {
    expect(cleanTitle(input)).toBe(expected);
  });
});

describe("cleanChannel", () => {
  it("remove sufixos automáticos", () => {
    expect(cleanChannel("Alan Walker - Topic")).toBe("Alan Walker");
    expect(cleanChannel("AdeleVEVO")).toBe("Adele");
  });
});

describe("splitArtistTitle", () => {
  it("separa por hífen ou travessão", () => {
    expect(splitArtistTitle("A - B - C")).toEqual({ artist: "A", title: "B - C" });
    expect(splitArtistTitle("A – B")).toEqual({ artist: "A", title: "B" });
    expect(splitArtistTitle("Sem separador")).toBeNull();
    expect(splitArtistTitle("Hífen-colado")).toBeNull();
  });
});

describe("metadataFromInfo", () => {
  it("usa os campos de música do YouTube Music", () => {
    const info = {
      id: "hqunboWdJAk",
      title: "Fade",
      track: "Fade",
      artists: ["Alan Walker", "Someone"],
      artist: "Alan Walker, Someone",
      album: "Origins",
      track_number: 4,
      release_year: 2022,
      uploader: "Alan Walker - Topic",
    };
    expect(metadataFromInfo(info, { playlist: "Mix", index: 7 })).toEqual({
      id: "hqunboWdJAk",
      title: "Fade",
      artist: "Alan Walker, Someone",
      album: "Origins",
      track: 4,
      year: 2022,
      uploader: "Alan Walker - Topic",
      playlist: "Mix",
      index: 7,
    });
  });

  it("separa 'Artista - Título' e limpa o título em vídeos comuns", () => {
    const meta = metadataFromInfo({
      id: "D9syciL3Xsg",
      title: "Alan Walker - Fade [COPYRIGHTED NCS Release]",
      uploader: "Some Channel",
    });
    expect(meta).toMatchObject({ artist: "Alan Walker", title: "Fade", album: undefined });
  });

  it("usa o canal como artista quando não há outra pista", () => {
    const meta = metadataFromInfo({
      id: "x",
      title: "Fade (Official Video)",
      channel: "AlanWalkerVEVO",
    });
    expect(meta).toMatchObject({ artist: "AlanWalker", title: "Fade" });
  });

  it("extrai o ano da data de lançamento", () => {
    expect(metadataFromInfo({ id: "x", title: "t", release_date: "20190301" }).year).toBe(2019);
    expect(metadataFromInfo({ id: "x", title: "t" }).year).toBeUndefined();
  });
});
