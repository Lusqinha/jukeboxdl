import { describe, expect, it } from "vitest";
import { sanitizeSegment, truncateBytes } from "./sanitize";

describe("sanitizeSegment", () => {
  it.each([
    ["Title: Subtitle", "Title - Subtitle"],
    ["12:00", "12-00"],
    ['Say "Hi"', "Say 'Hi'"],
    ["What?<>*", "What"],
    ["a | b", "a - b"],
    ["  ...hidden  ", "hidden"],
    ["trailing.", "trailing"],
    ["CON", "_CON"],
    ["nul.txt", "_nul.txt"],
    ["tab\there", "tab here"],
    ["Live ()", "Live"],
  ])("%j → %j", (input, expected) => {
    expect(sanitizeSegment(input)).toBe(expected);
  });

  it("normaliza para NFC", () => {
    expect(sanitizeSegment("á")).toBe("á");
  });
});

describe("truncateBytes", () => {
  it("mantém textos curtos", () => {
    expect(truncateBytes("abc", 10)).toBe("abc");
  });

  it("não quebra emojis compostos", () => {
    const family = "👨‍👩‍👧";
    expect(truncateBytes(`a${family}`, 5)).toBe("a");
  });
});
