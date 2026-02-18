const KEY_GROUP_HOST = (groupId: string) => `chooseamovie:group_host:${groupId}`;

export function markHostForGroup(groupId: string) {
  localStorage.setItem(KEY_GROUP_HOST(groupId), "1");
}

export function isHostForGroup(groupId: string) {
  return localStorage.getItem(KEY_GROUP_HOST(groupId)) === "1";
}
