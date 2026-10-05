// YouTube and Vimeo lessons: the URL an author pastes, turned into the
// player URL the course page embeds. Anything else is refused on save.

const YOUTUBE_ID = /^[\w-]{11}$/;

function youtubeId(url: URL): string | null {
  const host = url.hostname.replace(/^(www|m)\./, "");
  if (host === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const match = /^\/(?:embed|shorts|live|v)\/([\w-]+)/.exec(url.pathname);
  return match?.[1] ?? null;
}

export type Embed = { provider: "YOUTUBE" | "VIMEO"; src: string };

/** The embeddable player URL, or null if this isn't a YouTube/Vimeo video. */
export function toEmbed(raw: string): Embed | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const id = youtubeId(url);
  if (id && YOUTUBE_ID.test(id)) {
    const start = Number.parseInt(url.searchParams.get("t") ?? url.searchParams.get("start") ?? "", 10);
    return {
      provider: "YOUTUBE",
      src: `https://www.youtube-nocookie.com/embed/${id}${start > 0 ? `?start=${start}` : ""}`,
    };
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    // vimeo.com/123, vimeo.com/123/abcdef (unlisted hash),
    // player.vimeo.com/video/123?h=abcdef, vimeo.com/channels/x/123
    const parts = url.pathname.split("/").filter(Boolean);
    const index = parts.findIndex((part) => /^\d+$/.test(part));
    if (index === -1) return null;
    const videoId = parts[index];
    const hash = url.searchParams.get("h") ?? (/^[0-9a-f]+$/i.test(parts[index + 1] ?? "") ? parts[index + 1] : null);
    return {
      provider: "VIMEO",
      src: `https://player.vimeo.com/video/${videoId}${hash ? `?h=${hash}` : ""}`,
    };
  }
  return null;
}
