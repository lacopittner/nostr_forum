import { NDKEvent } from "@nostr-dev-kit/ndk";

const MODERATOR_ROLE = "moderator";
const CORE_COMMUNITY_TAGS = new Set([
  "d",
  "name",
  "description",
  "image",
  "rules",
  "p",
  "flair",
  "open",
  "closed",
  "spoiler",
  "nsfw",
]);

const normalizeTagValue = (value: string | undefined): string => value?.trim() || "";

const uniqueValues = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

export function getCommunityTagValue(community: NDKEvent, tagName: string): string {
  return community.tags.find((tag) => tag[0] === tagName)?.[1] || "";
}

export function getCommunityModerators(community: NDKEvent): string[] {
  const moderators = community.tags
    .filter((tag) => tag[0] === "p" && tag[3] === MODERATOR_ROLE)
    .map((tag) => normalizeTagValue(tag[1]));

  return uniqueValues([community.pubkey, ...moderators]);
}

export function getCommunityFlairs(community: NDKEvent): string[] {
  return uniqueValues(
    community.tags
      .filter((tag) => tag[0] === "flair")
      .map((tag) => normalizeTagValue(tag[1]))
  );
}

export function isCommunityClosed(community: NDKEvent): boolean {
  if (community.tags.some((tag) => tag[0] === "closed")) return true;
  if (community.tags.some((tag) => tag[0] === "open")) return false;
  return true;
}

function parseBooleanTag(community: NDKEvent, tagName: string): boolean {
  const value = community.tags.find((tag) => tag[0] === tagName)?.[1];
  if (value === undefined || value === "") return community.tags.some((tag) => tag[0] === tagName);
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function isCommunitySpoilerDefault(community: NDKEvent): boolean {
  return parseBooleanTag(community, "spoiler");
}

export function isCommunityNsfwDefault(community: NDKEvent): boolean {
  return parseBooleanTag(community, "nsfw");
}

interface BuildCommunityTagsInput {
  d: string;
  name: string;
  description?: string;
  image?: string;
  rules?: string;
  ownerPubkey: string;
  moderators?: string[];
  flairs?: string[];
  closed?: boolean;
  spoiler?: boolean;
  nsfw?: boolean;
  baseTags?: string[][];
}

export function buildCommunityTags({
  d,
  name,
  description = "",
  image = "",
  rules = "",
  ownerPubkey,
  moderators = [],
  flairs = [],
  closed = true,
  spoiler = false,
  nsfw = false,
  baseTags = [],
}: BuildCommunityTagsInput): string[][] {
  const dedupedModerators = uniqueValues([ownerPubkey, ...moderators]);
  const dedupedFlairs = uniqueValues(flairs);

  const tags: string[][] = [
    ["d", d],
    ["name", name],
    ["description", description],
    ["image", image],
    ["rules", rules],
    closed ? ["closed", ""] : ["open", ""],
    ...(spoiler ? [["spoiler", "1"]] : []),
    ...(nsfw ? [["nsfw", "1"]] : []),
    ...dedupedFlairs.map((flair) => ["flair", flair]),
    ...dedupedModerators.map((moderator) => ["p", moderator, "", MODERATOR_ROLE]),
  ];

  const extraTags = baseTags.filter((tag) => !CORE_COMMUNITY_TAGS.has(tag[0] || ""));
  return [...tags, ...extraTags];
}
