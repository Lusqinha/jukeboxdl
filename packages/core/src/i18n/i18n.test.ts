import { afterEach, describe, expect, it } from "vitest";
import { validateTemplate } from "../template/template";
import { detectLocale, format, setLocale } from "./index";

afterEach(() => setLocale("pt-BR"));

describe("i18n", () => {
  it("interpola parâmetros e plurais, preservando chaves sem parâmetro", () => {
    expect(format("{n} {n|faixa|faixas} em {title}", { n: 1 })).toBe("1 faixa em {title}");
    expect(format("{n} {n|faixa|faixas}", { n: 3 })).toBe("3 faixas");
  });

  it("detecta o idioma pelo ambiente", () => {
    expect(detectLocale({ JUKEBOXDL_LANG: "en" })).toBe("en");
    expect(detectLocale({ LANG: "pt_BR.UTF-8" })).toBe("pt-BR");
    expect(detectLocale({ LANG: "de_DE.UTF-8" })).toBe("en");
  });

  it("troca o idioma das mensagens", () => {
    setLocale("en");
    expect(validateTemplate("{nope}")[0]?.message).toMatch(/^Unknown variable \{nope\}/);
  });
});
