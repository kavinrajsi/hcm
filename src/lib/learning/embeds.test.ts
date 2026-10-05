import { describe, expect, it } from "vitest";
import { toEmbed } from "./embeds";

describe("toEmbed", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=42", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
    ["https://m.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"],
  ])("YouTube %s", (url, src) => {
    expect(toEmbed(url)).toEqual({ provider: "YOUTUBE", src });
  });

  it.each([
    ["https://vimeo.com/123456789", "https://player.vimeo.com/video/123456789"],
    // Unlisted videos need their hash or the player refuses them.
    ["https://vimeo.com/123456789/abcdef1234", "https://player.vimeo.com/video/123456789?h=abcdef1234"],
    ["https://player.vimeo.com/video/123456789?h=abcdef1234", "https://player.vimeo.com/video/123456789?h=abcdef1234"],
    ["https://vimeo.com/channels/staffpicks/123456789", "https://player.vimeo.com/video/123456789"],
  ])("Vimeo %s", (url, src) => {
    expect(toEmbed(url)).toEqual({ provider: "VIMEO", src });
  });

  it.each(["https://example.com/video.mp4", "javascript:alert(1)", "not a url", "https://youtube.com/watch?v=short", "https://vimeo.com/about"])(
    "refuses %s",
    (url) => {
      expect(toEmbed(url)).toBeNull();
    },
  );
});
