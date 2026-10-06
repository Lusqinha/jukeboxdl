import { describe, expect, it } from "vitest";
import { ConfigError } from "../errors";
import { formatConfigValue, getConfigValue, setConfigValue } from "./fields";
import { DEFAULT_CONFIG } from "./schema";

describe("config fields", () => {
  it("lê chaves aninhadas", () => {
    expect(getConfigValue(DEFAULT_CONFIG, "audio.bitrate")).toBe(192);
    expect(getConfigValue(DEFAULT_CONFIG, "binaries.ytDlp")).toBeUndefined();
  });

  it("converte e valida valores digitados", () => {
    let config = setConfigValue(DEFAULT_CONFIG, "audio.bitrate", "320");
    config = setConfigValue(config, "skipDuplicates", "não");
    config = setConfigValue(config, "binaries.ytDlp", "/opt/yt-dlp");
    config = setConfigValue(config, "theme", "classico");
    expect(config.theme).toBe("classico");
    expect(config.audio.bitrate).toBe(320);
    expect(config.skipDuplicates).toBe(false);
    expect(config.binaries.ytDlp).toBe("/opt/yt-dlp");
    expect(DEFAULT_CONFIG.audio.bitrate).toBe(192);
  });

  it("remove campos opcionais com valor vazio", () => {
    const config = setConfigValue(DEFAULT_CONFIG, "binaries.ytDlp", "/x");
    expect(setConfigValue(config, "binaries.ytDlp", "").binaries).toEqual({});
  });

  it.each([
    ["audio.bitrate", "300"],
    ["theme", "vaporwave"],
    ["concurrency", "20"],
    ["concurrency", "abc"],
    ["skipDuplicates", "talvez"],
    ["filenameTemplate", "{artista}"],
    ["inexistente", "1"],
  ])("rejeita %s = %s", (key, value) => {
    expect(() => setConfigValue(DEFAULT_CONFIG, key, value)).toThrow(ConfigError);
  });

  it("formata para exibição", () => {
    expect(formatConfigValue(true)).toBe("sim");
    expect(formatConfigValue(undefined)).toBe("(automático)");
    expect(formatConfigValue(3)).toBe("3");
  });
});
