import { describe, expect, it } from "vitest";
import { expandHome, getAppPaths } from "./paths";

const home = "/home/user";

describe("getAppPaths", () => {
  it("usa os padrões XDG no Linux", () => {
    expect(getAppPaths({ env: {}, platform: "linux", home })).toEqual({
      config: "/home/user/.config/jukeboxdl",
      data: "/home/user/.local/share/jukeboxdl",
      bin: "/home/user/.local/share/jukeboxdl/bin",
      configFile: "/home/user/.config/jukeboxdl/config.json",
    });
  });

  it("respeita XDG_CONFIG_HOME e XDG_DATA_HOME", () => {
    const paths = getAppPaths({
      env: { XDG_CONFIG_HOME: "/cfg", XDG_DATA_HOME: "/data" },
      platform: "linux",
      home,
    });
    expect(paths.config).toBe("/cfg/jukeboxdl");
    expect(paths.bin).toBe("/data/jukeboxdl/bin");
  });

  it("usa JUKEBOXDL_HOME como diretório único", () => {
    const paths = getAppPaths({ env: { JUKEBOXDL_HOME: "/portable" }, platform: "linux", home });
    expect(paths.configFile).toBe("/portable/config.json");
    expect(paths.bin).toBe("/portable/bin");
  });

  it("usa Application Support no macOS", () => {
    expect(getAppPaths({ env: {}, platform: "darwin", home }).config).toBe(
      "/home/user/Library/Application Support/jukeboxdl",
    );
  });
});

describe("expandHome", () => {
  it("expande ~", () => {
    expect(expandHome("~/Music", home)).toBe("/home/user/Music");
    expect(expandHome("~", home)).toBe(home);
    expect(expandHome("/abs/~", home)).toBe("/abs/~");
  });
});
