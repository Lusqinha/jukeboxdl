import { describe, expect, it } from "vitest";
import {
  extractError,
  parseProgressLine,
  parseResolveResult,
  parseSearchResult,
  toVideoSummary,
} from "./parse";

const entry = {
  _type: "url",
  ie_key: "Youtube",
  id: "D9syciL3Xsg",
  url: "https://www.youtube.com/watch?v=D9syciL3Xsg",
  title: "Alan Walker - Fade",
  duration: 261,
  channel: "Some Channel",
  thumbnails: [{ url: "small.jpg" }, { url: "big.jpg" }],
};

describe("toVideoSummary", () => {
  it("converte uma entrada de busca", () => {
    expect(toVideoSummary(entry)).toEqual({
      id: "D9syciL3Xsg",
      title: "Alan Walker - Fade",
      url: "https://www.youtube.com/watch?v=D9syciL3Xsg",
      duration: 261,
      channel: "Some Channel",
      thumbnail: "big.jpg",
    });
  });

  it("monta a URL quando a entrada só traz o id", () => {
    expect(toVideoSummary({ id: "abcdefghijk", title: "x", url: "abcdefghijk" })?.url).toBe(
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
  });

  it.each([
    ["privado", { ...entry, title: "[Private video]" }],
    ["removido", { ...entry, title: "[Deleted video]" }],
    ["sub-playlist", { ...entry, ie_key: "YoutubeTab", id: "PLxxxxxxxxxxxxxxxx" }],
    ["sem título", { ...entry, title: null }],
  ])("descarta vídeo %s", (_, value) => {
    expect(toVideoSummary(value)).toBeNull();
  });
});

describe("parseSearchResult", () => {
  it("lista só vídeos válidos", () => {
    const result = parseSearchResult({ _type: "playlist", entries: [entry, { title: "?" }] });
    expect(result.map((v) => v.id)).toEqual(["D9syciL3Xsg"]);
  });
});

describe("parseResolveResult", () => {
  it("reconhece vídeo único", () => {
    expect(parseResolveResult({ ...entry, _type: "video" })).toMatchObject({
      kind: "video",
      video: { id: "D9syciL3Xsg" },
    });
  });

  it("mantém a posição original das faixas e conta as indisponíveis", () => {
    const result = parseResolveResult({
      _type: "playlist",
      id: "PL1",
      title: "Favoritas",
      uploader: "Lucas",
      entries: [entry, { ...entry, title: "[Private video]" }, { ...entry, id: "zzzzzzzzzzz" }],
    });
    expect(result).toMatchObject({
      kind: "playlist",
      title: "Favoritas",
      channel: "Lucas",
      unavailable: 1,
    });
    expect(result?.kind === "playlist" && result.items.map((i) => [i.id, i.index])).toEqual([
      ["D9syciL3Xsg", 1],
      ["zzzzzzzzzzz", 3],
    ]);
  });
});

describe("parseProgressLine", () => {
  it("lê o JSON de progresso", () => {
    const line = `[jukeboxdl]{"status": "downloading", "downloaded_bytes": 50, "total_bytes": null, "total_bytes_estimate": 200, "speed": 10.5, "eta": 15}`;
    expect(parseProgressLine(line)).toEqual({
      phase: "download",
      downloaded: 50,
      total: 200,
      speed: 10.5,
      eta: 15,
    });
  });

  it("detecta a conversão e ignora o resto", () => {
    expect(parseProgressLine("[ExtractAudio] Destination: x.mp3")).toEqual({ phase: "convert" });
    expect(parseProgressLine("[youtube] Extracting URL")).toBeNull();
    expect(parseProgressLine("[jukeboxdl]{quebrado")).toBeNull();
  });
});

describe("extractError", () => {
  it("prefere a última linha ERROR:", () => {
    expect(extractError("WARNING: x\nERROR: [youtube] abc: Video unavailable\n")).toBe(
      "[youtube] abc: Video unavailable",
    );
    expect(extractError("algo deu errado\n")).toBe("algo deu errado");
    expect(extractError("")).toBeUndefined();
  });
});
