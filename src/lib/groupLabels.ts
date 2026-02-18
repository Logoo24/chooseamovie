import type { Group, GroupSettings } from "@/lib/storage";

export function customListLabel(contentType: GroupSettings["contentType"]) {
  return contentType === "movies" ? "Custom Movie List" : "Custom Movie/Show List";
}

export function ratingModeLabel(settings: GroupSettings) {
  if (settings.ratingMode === "shortlist") return customListLabel(settings.contentType);
  return "Unlimited rating";
}

export function isCustomListMode(group: Group) {
  return group.settings.ratingMode === "shortlist";
}
