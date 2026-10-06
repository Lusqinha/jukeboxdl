import { BinaryError } from "@jukeboxdl/core";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { Doctor } from "./Doctor";

describe("Doctor", () => {
  it("mostra binários encontrados, ausentes e com erro", () => {
    const { lastFrame } = render(
      <Doctor
        configFile="/cfg/config.json"
        configError={null}
        binDir="/data/bin"
        binaries={{
          "yt-dlp": {
            name: "yt-dlp",
            path: "/usr/bin/yt-dlp",
            version: "2026.09.01",
            source: "system",
          },
          ffmpeg: null,
          ffprobe: new BinaryError("caminho inválido"),
        }}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("✔ yt-dlp");
    expect(frame).toContain("2026.09.01");
    expect(frame).toContain("[sistema]");
    expect(frame).toMatch(/✖ ffmpeg\s+não encontrado/);
    expect(frame).toContain("caminho inválido");
  });
});
