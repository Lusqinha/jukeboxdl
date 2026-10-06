import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { ConfigError } from "../errors";
import { DEFAULT_CONFIG } from "./schema";
import { loadConfig, saveConfig } from "./store";

let file: string;

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), "jukeboxdl-config-")), "nested", "config.json");
});

describe("config", () => {
  it("retorna os padrões quando o arquivo não existe", async () => {
    expect(await loadConfig(file)).toEqual(DEFAULT_CONFIG);
  });

  it("completa campos ausentes com os padrões", async () => {
    await saveConfig({ concurrency: 5, audio: { bitrate: 320 } }, file);
    const config = await loadConfig(file);
    expect(config.concurrency).toBe(5);
    expect(config.audio).toEqual({ bitrate: 320, embedCover: true });
    expect(config.filenameTemplate).toBe(DEFAULT_CONFIG.filenameTemplate);
  });

  it("grava JSON legível", async () => {
    await saveConfig({}, file);
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(DEFAULT_CONFIG);
  });

  it("rejeita template inválido apontando o campo", async () => {
    await saveConfig({}, file);
    await writeFile(file, JSON.stringify({ filenameTemplate: "{artista}" }));
    const error = await loadConfig(file).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as ConfigError).issues[0]).toMatch(/^filenameTemplate: Variável desconhecida/);
  });

  it("rejeita JSON malformado", async () => {
    await saveConfig({}, file);
    await writeFile(file, "{ nope");
    await expect(loadConfig(file)).rejects.toThrow(/JSON inválido/);
  });

  it("não grava configuração inválida", async () => {
    // @ts-expect-error valor fora do permitido
    await expect(saveConfig({ audio: { bitrate: 100 } }, file)).rejects.toThrow(ConfigError);
  });
});
