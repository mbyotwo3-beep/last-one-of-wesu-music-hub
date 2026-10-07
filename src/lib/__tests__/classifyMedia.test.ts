/**
 * Media classification for the admin gallery.
 *
 * Drives the thumbnail: an image renders as a real preview, everything else
 * gets its file-type icon. Mirrors classifyMedia in src/lib/storage.functions.ts.
 */

import { describe, expect, it } from "vitest";

const IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"];
const AUDIO = ["mp3", "wav", "ogg", "oga", "opus", "flac", "aac", "m4a"];
const VIDEO = ["mp4", "webm", "mov", "m4v"];

type Kind = "image" | "audio" | "video" | "other";

function classifyMedia(name: string): Kind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (IMAGE.includes(ext)) return "image";
  if (AUDIO.includes(ext)) return "audio";
  if (VIDEO.includes(ext)) return "video";
  return "other";
}

describe("classifyMedia", () => {
  it("recognises image formats in any case", () => {
    for (const ext of IMAGE) {
      expect(classifyMedia(`artist-uuid/cover.${ext}`)).toBe("image");
      expect(classifyMedia(`COVER.${ext.toUpperCase()}`)).toBe("image");
    }
  });

  it("recognises audio formats", () => {
    for (const ext of AUDIO) expect(classifyMedia(`song-audio/u/track.${ext}`)).toBe("audio");
  });

  it("recognises video formats", () => {
    for (const ext of VIDEO) expect(classifyMedia(`u/clip.${ext}`)).toBe("video");
  });

  it("falls back to 'other' for anything unrecognised", () => {
    expect(classifyMedia("notes.txt")).toBe("other");
    expect(classifyMedia("noextension")).toBe("other");
    expect(classifyMedia("")).toBe("other");
  });

  it("classifies by the LAST dot, so dotted folders do not confuse it", () => {
    expect(classifyMedia("a.b.c/song.v2.mp3")).toBe("audio");
    expect(classifyMedia("v1.2.3/cover.jpg")).toBe("image");
  });

  it("treats a trailing dot as unrecognised rather than throwing", () => {
    expect(classifyMedia("weird.")).toBe("other");
  });
});
