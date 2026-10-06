import { describe, expect, it } from "vitest";
import { buildFfmetadata, buildTagArgs, flacPictureBlock } from "./write";

const base = { ffmpeg: "ffmpeg", input: "in.mp3", output: "out.mp3", workdir: "/tmp" };
const cover = { path: "cover.jpg", width: 600, height: 600 };

describe("tags", () => {
  it("mp3: grava só as tags preenchidas, mais as extras", () => {
    const args = buildTagArgs({
      ...base,
      format: "mp3",
      metadata: { id: "abc", title: "T", artist: "A", year: 2020 },
      extraTags: { REPLAYGAIN_TRACK_GAIN: "-3.00 dB" },
    });
    const tags = args.flatMap((arg, i) => (args[i - 1] === "-metadata" ? [arg] : []));
    expect(tags).toEqual([
      "title=T",
      "artist=A",
      "date=2020",
      "comment=https://youtu.be/abc",
      "REPLAYGAIN_TRACK_GAIN=-3.00 dB",
    ]);
    expect(args.at(-1)).toBe("out.mp3");
  });

  it("m4a: capa anexada e sem tags extras", () => {
    const args = buildTagArgs({
      ...base,
      format: "m4a",
      cover,
      metadata: { id: "x", title: "T" },
      extraTags: { X: "1" },
    });
    expect(args).toEqual(expect.arrayContaining(["cover.jpg", "attached_pic", "ipod"]));
    expect(args.join(" ")).not.toContain("X=1");
  });

  it("opus: escapa o ffmetadata e monta o bloco PICTURE", () => {
    expect(buildFfmetadata({ title: "a=b;c#d\\e" })).toBe(
      ";FFMETADATA1\ntitle=a\\=b\\;c\\#d\\\\e\n",
    );
    const block = flacPictureBlock(Buffer.from("img"), cover);
    expect(block.readUInt32BE(0)).toBe(3);
    expect(block.subarray(-3).toString()).toBe("img");
  });
});
