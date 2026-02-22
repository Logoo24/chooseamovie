import type { Group } from "@/lib/storage";
import type { Title } from "@/lib/titles";

export type Member = {
  id: string;
  name: string;
  createdAt: string;
};

export type RatingValue = 0 | 1 | 2 | 3 | 4 | 5; // 0 = skipped
export type MemberRatings = Record<string, RatingValue>; // titleId -> rating

const KEY_MEMBERS = (groupId: string) => `chooseamovie:members:${groupId}`;
const KEY_MEMBER_ACTIVE = (groupId: string) => `chooseamovie:member_active:${groupId}`;
const KEY_RATINGS = (groupId: string, memberId: string) => `chooseamovie:ratings:${groupId}:${memberId}`;

export function makeId() {
  return crypto.randomUUID();
}

export function getActiveMember(groupId: string): Member | null {
  const raw = localStorage.getItem(KEY_MEMBER_ACTIVE(groupId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Member;
  } catch {
    return null;
  }
}

export function setActiveMember(groupId: string, member: Member) {
  localStorage.setItem(KEY_MEMBER_ACTIVE(groupId), JSON.stringify(member));
}

export function clearActiveMember(groupId: string) {
  localStorage.removeItem(KEY_MEMBER_ACTIVE(groupId));
}

export function listMembers(groupId: string): Member[] {
  const raw = localStorage.getItem(KEY_MEMBERS(groupId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as Member[];
  } catch {
    return [];
  }
}

export function upsertMember(groupId: string, member: Member) {
  const members = listMembers(groupId);
  const idx = members.findIndex((m) => m.id === member.id);

  let next = members;
  if (idx >= 0) {
    next = [...members];
    next[idx] = member;
  } else {
    next = [member, ...members];
  }

  localStorage.setItem(KEY_MEMBERS(groupId), JSON.stringify(next));
}

export function ensureMemberByName(groupId: string, name: string): Member {
  const trimmed = name.trim();
  const members = listMembers(groupId);

  const existing = members.find((m) => m.name.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;

  const created: Member = {
    id: makeId(),
    name: trimmed,
    createdAt: new Date().toISOString(),
  };

  upsertMember(groupId, created);
  return created;
}

export function loadRatings(groupId: string, memberId: string): MemberRatings {
  const raw = localStorage.getItem(KEY_RATINGS(groupId, memberId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as MemberRatings;
  } catch {
    return {};
  }
}

export function saveRatings(groupId: string, memberId: string, ratings: MemberRatings) {
  localStorage.setItem(KEY_RATINGS(groupId, memberId), JSON.stringify(ratings));
}

export function setRating(groupId: string, memberId: string, titleId: string, value: RatingValue) {
  const ratings = loadRatings(groupId, memberId);
  ratings[titleId] = value;
  saveRatings(groupId, memberId, ratings);
}

export function countRated(ratings: MemberRatings) {
  return Object.keys(ratings).length;
}

export function passesGroupFilters(group: Group, title: Title) {
  if (group.settings.contentType === "movies" && title.type !== "movie") return false;

  const r = title.mpaa;
  if (!r) return true;

  if (r === "G" && !group.settings.allowG) return false;
  if (r === "PG" && !group.settings.allowPG) return false;
  if (r === "PG-13" && !group.settings.allowPG13) return false;
  if (r === "R" && !group.settings.allowR) return false;

  return true;
}

export type AggregatedRow = {
  titleId: string;
  totalStars: number;
  avg: number;
  votes: number;
  skips: number;
};

export function aggregateGroupRatings(groupId: string): {
  members: Member[];
  perMember: Record<string, MemberRatings>;
  rows: AggregatedRow[];
} {
  const members = listMembers(groupId);
  const perMember: Record<string, MemberRatings> = {};
  const totals: Record<string, { sum: number; votes: number; skips: number }> = {};

  for (const m of members) {
    const r = loadRatings(groupId, m.id);
    perMember[m.id] = r;

    for (const [titleId, val] of Object.entries(r)) {
      if (!totals[titleId]) totals[titleId] = { sum: 0, votes: 0, skips: 0 };
      if (val === 0) totals[titleId].skips += 1;
      else {
        totals[titleId].sum += val;
        totals[titleId].votes += 1;
      }
    }
  }

  const rows: AggregatedRow[] = Object.entries(totals).map(([titleId, t]) => ({
    titleId,
    totalStars: t.sum,
    avg: t.votes ? t.sum / t.votes : 0,
    votes: t.votes,
    skips: t.skips,
  }));

  rows.sort((a, b) => {
    if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
    if (b.avg !== a.avg) return b.avg - a.avg;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.titleId.localeCompare(b.titleId);
  });

  return { members, perMember, rows };
}

export function clearLocalGroupRatingsData(groupId: string) {
  localStorage.removeItem(KEY_MEMBERS(groupId));
  localStorage.removeItem(KEY_MEMBER_ACTIVE(groupId));

  const prefix = `chooseamovie:ratings:${groupId}:`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
