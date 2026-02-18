const KEY_HOST_DISPLAY_NAME = "chooseamovie:host_display_name";

export function getHostDisplayName() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY_HOST_DISPLAY_NAME) ?? "";
}

export function setHostDisplayName(name: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_HOST_DISPLAY_NAME, name.trim());
}
