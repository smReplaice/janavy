/**
 * Dataroom banner media classification.
 *
 * A dataroom banner column can hold an uploaded image URL, a direct video
 * URL, a YouTube link, the "no-banner" sentinel or nothing. Viewers and the
 * branding editor need to know which <img>/<video>/<iframe> to render.
 */

export const NO_BANNER_SENTINEL = "no-banner";

export type DataroomBannerKind = "image" | "video" | "youtube" | "none";

export type DataroomBanner =
  | { kind: "none" }
  | { kind: "image"; src: string }
  | { kind: "video"; src: string }
  | { kind: "youtube"; src: string; youtubeId: string };

const VIDEO_FILE_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".ogv",
  ".ogg",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
];

const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/** Extract the 11-character video id from any common YouTube URL shape. */
export function extractYouTubeId(
  url: string,
): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery && YOUTUBE_ID_PATTERN.test(fromQuery)) return fromQuery;
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (
        segments.length >= 2 &&
        ["embed", "shorts", "live", "v"].includes(segments[0]) &&
        YOUTUBE_ID_PATTERN.test(segments[1])
      ) {
        return segments[1];
      }
    }
  } catch {
    // Not a parseable absolute URL — not a YouTube link.
  }
  return null;
}

export function classifyDataroomBanner(
  src: string | null | undefined,
): DataroomBanner {
  const value = typeof src === "string" ? src.trim() : "";
  if (!value || value === NO_BANNER_SENTINEL) {
    return { kind: "none" };
  }

  const youtubeId = extractYouTubeId(value);
  if (youtubeId) {
    return { kind: "youtube", src: value, youtubeId };
  }

  const lower = value.split("?")[0].split("#")[0].toLowerCase();
  if (
    lower.startsWith("data:video/") ||
    VIDEO_FILE_EXTENSIONS.some((extension) => lower.endsWith(extension))
  ) {
    return { kind: "video", src: value };
  }

  return { kind: "image", src: value };
}
