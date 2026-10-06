import { describe, expect, it } from "vitest";
import { buildTagArgs } from "./write";

const base = { ffmpeg: "ffmpeg", input: "in.mp3", output: "out.mp3" };

describe("buildTagArgs", () => {
  it("grava só as tags preenchidas", () => {
    const args = buildTagArgs({
      ...base,
      metadata: { id: "abc", title: "T", artist: "A", year: 2020 },
    });
    const tags = args.flatMap((arg, i) => (args[i - 1] === "-metadata" ? [arg] : []));
    expect(tags).toEqual(["title=T", "artist=A", "date=2020", "comment=https://youtu.be/abc"]);
    expect(args).not.toContain("attached_pic");
    expect(args.at(-1)).toBe("out.mp3");
  });

  it("embute a capa recortada quando informada", () => {
    const args = buildTagArgs({ ...base, cover: "cover.jpg", metadata: { id: "x", title: "T" } });
    expect(args).toEqual(expect.arrayContaining(["cover.jpg", "attached_pic", "1:v"]));
    expect(args[args.indexOf("-vf") + 1]).toMatch(/^crop=/);
  });
});
