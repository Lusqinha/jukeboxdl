import { describe, expect, it } from "vitest";
import { TemplateError } from "../errors";
import { parseTemplate, renderTemplate, validateTemplate } from "./template";

const track = {
  id: "abc123",
  title: "Aerodynamic",
  artist: "Daft Punk",
  album: "Discovery",
  track: 2,
  year: 2001,
};

describe("parseTemplate", () => {
  it("separa texto e variáveis com padding e fallback", () => {
    expect(parseTemplate("{track:02} - {album|Singles}/{title}").tokens).toEqual([
      { type: "variable", name: "track", pad: 2 },
      { type: "text", value: " - " },
      { type: "variable", name: "album", fallback: "Singles" },
      { type: "text", value: "/" },
      { type: "variable", name: "title" },
    ]);
  });

  it("aceita chaves escapadas", () => {
    expect(parseTemplate("{{x}} {title}").tokens[0]).toEqual({ type: "text", value: "{x} " });
  });

  it.each([
    ["{titel}", "Variável desconhecida {titel}"],
    ["{title", "não foi fechada"],
    ["title}", "sem `{`"],
    ["{title:ab}", "Placeholder inválido"],
    ["{artist} - {album}", "{title} ou {id}"],
  ])("aponta erro em %s", (template, message) => {
    const issues = validateTemplate(template);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain(message);
  });
});

describe("renderTemplate", () => {
  it("gera pastas e nome do arquivo", () => {
    expect(renderTemplate("{artist}/{album}/{track:02} - {title}", track)).toBe(
      "Daft Punk/Discovery/02 - Aerodynamic.mp3",
    );
  });

  it("usa o fallback quando a variável está vazia", () => {
    expect(renderTemplate("{album|Singles}/{title}", { title: "X" })).toBe("Singles/X.mp3");
  });

  it("limpa separadores e parênteses que sobram de variáveis vazias", () => {
    expect(renderTemplate("{artist} - {album} - {title} ({year})", { title: "Song" })).toBe(
      "Song.mp3",
    );
    expect(renderTemplate("{artist} - {album} - {title}", { artist: "A", title: "T" })).toBe(
      "A - T.mp3",
    );
  });

  it("não cria pastas a partir de barras nos valores", () => {
    expect(renderTemplate("{artist}/{title}", { artist: "AC/DC", title: "T.N.T." })).toBe(
      "AC-DC/T.N.T.mp3",
    );
  });

  it("descarta pastas vazias e trata segmentos perigosos", () => {
    expect(renderTemplate("{playlist}/../{title}", { title: "x" })).toBe("x.mp3");
  });

  it("usa um nome padrão quando o arquivo ficaria sem nome", () => {
    expect(renderTemplate("{title}", { title: "???" })).toBe("Sem título.mp3");
  });

  it("respeita o limite de bytes sem quebrar caracteres", () => {
    const result = renderTemplate("{title}", { title: "ã".repeat(200) }, { maxSegmentBytes: 50 });
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(50);
    expect(result).toMatch(/^ã+\.mp3$/);
  });

  it("lança TemplateError para template inválido", () => {
    expect(() => renderTemplate("{nope}", track)).toThrow(TemplateError);
  });
});
