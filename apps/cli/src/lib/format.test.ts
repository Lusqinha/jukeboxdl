import { describe, expect, it } from "vitest";
import { formatDuration, parseItems } from "./format";

describe("format", () => {
  it("formata duração", () => {
    expect(formatDuration(224)).toBe("3:44");
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(undefined)).toBe("--:--");
  });

  it("interpreta intervalos de faixas", () => {
    expect([...parseItems("1-3, 7,5-4")]).toEqual([1, 2, 3, 7, 4, 5]);
    expect(() => parseItems("a")).toThrow();
  });
});
