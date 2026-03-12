import { NDKEvent } from "@nostr-dev-kit/ndk";

export interface SensitiveFlags {
  spoiler: boolean;
  nsfw: boolean;
}

function isTruthyTagValue(value: string | undefined): boolean {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return true;
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function getSensitiveFlagsFromTags(tags: string[][]): SensitiveFlags {
  const spoilerTag = tags.find((tag) => tag[0] === "spoiler");
  const nsfwTag = tags.find((tag) => tag[0] === "nsfw");

  const contentWarningTags = tags.filter((tag) => tag[0] === "content-warning").map((tag) => (tag[1] || "").toLowerCase());

  const spoiler = Boolean(spoilerTag && isTruthyTagValue(spoilerTag[1])) || contentWarningTags.includes("spoiler");
  const nsfw = Boolean(nsfwTag && isTruthyTagValue(nsfwTag[1])) || contentWarningTags.includes("nsfw");

  return { spoiler, nsfw };
}

export function getSensitiveFlags(event: NDKEvent): SensitiveFlags {
  return getSensitiveFlagsFromTags(event.tags);
}

export function applySensitiveFlags(tags: string[][], flags: SensitiveFlags): string[][] {
  const withoutSensitive = tags.filter((tag) => {
    const key = tag[0] || "";
    if (key === "spoiler" || key === "nsfw") return false;
    if (key !== "content-warning") return true;
    const value = (tag[1] || "").toLowerCase();
    return value !== "spoiler" && value !== "nsfw";
  });

  const nextTags = [...withoutSensitive];
  if (flags.spoiler) {
    nextTags.push(["spoiler", "1"]);
    nextTags.push(["content-warning", "spoiler"]);
  }
  if (flags.nsfw) {
    nextTags.push(["nsfw", "1"]);
    nextTags.push(["content-warning", "nsfw"]);
  }

  return nextTags;
}
