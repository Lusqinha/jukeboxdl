import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { History } from "./history";

describe("History", () => {
  it("registra e encontra o download mais recente", () => {
    const history = new History(":memory:");
    history.record({ videoId: "a", path: "/old.mp3", title: "Old" });
    history.record({ videoId: "a", path: "/new.mp3", title: "New", artist: "X" });
    expect(history.find("a")).toMatchObject({ path: "/new.mp3", artist: "X" });
    expect(history.find("b")).toBeUndefined();
    history.close();
  });

  it("lista com busca, paginação e escapando curingas", () => {
    const history = new History(":memory:");
    history.record({ videoId: "1", path: "/1", title: "Fade", artist: "Alan Walker" });
    history.record({ videoId: "2", path: "/2", title: "100% Pure", artist: "Other" });
    history.record({ videoId: "3", path: "/3", title: "Spectre", album: "Walker Album" });

    expect(history.list().map((e) => e.videoId)).toEqual(["3", "2", "1"]);
    expect(history.list({ search: "walker" }).map((e) => e.videoId)).toEqual(["3", "1"]);
    expect(history.list({ search: "%" }).map((e) => e.videoId)).toEqual(["2"]);
    expect(history.list({ limit: 1, offset: 1 }).map((e) => e.videoId)).toEqual(["2"]);
    expect(history.remove("1")).toBe(1);
    history.close();
  });

  it("persiste em arquivo e reabre sem refazer migrações", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "jukeboxdl-history-")), "sub", "history.db");
    const first = new History(file);
    first.record({ videoId: "a", path: "/a", title: "A" });
    first.close();

    const second = new History(file);
    expect(second.find("a")?.title).toBe("A");
    second.close();
  });
});
