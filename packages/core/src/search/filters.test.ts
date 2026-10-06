import { describe, expect, it } from "vitest";
import { applyFilters } from "./filters";

const v = (title: string, duration?: number) => ({ id: title, title, url: "", duration });

describe("filtros de busca", () => {
  it("filtra por duração e esconde versões", () => {
    const videos = [
      v("Song", 200),
      v("Song (Live)", 210),
      v("Mix", 3600),
      v("Song (Lyrics)", 200),
      v("Sem duração"),
    ];
    expect(
      applyFilters(videos, { duration: "short", hideVersions: true }).map((x) => x.id),
    ).toEqual(["Song", "Sem duração"]);
    expect(
      applyFilters(videos, { duration: "long", hideVersions: false }).map((x) => x.id),
    ).toEqual(["Mix"]);
  });
});
