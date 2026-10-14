// Shareable room links: /r/<slug> opens one room for anyone, so people can
// share a topic ("student secrets", "talk about your ex") instead of HIDN as
// a whole. Shared by the site and by the Worker, which uses it to give each
// link its own preview when pasted into a chat or a post.

export interface RoomLink {
  key: string;
  slug: string;
  title: string;
  description: string;
  /** A short note shown at the top of the room, for rooms that need one. */
  note?: string;
}

export const ROOM_LINKS: readonly RoomLink[] = [
  { key: "general", slug: "general", title: "GENERAL", description: "everything people are saying" },
  {
    key: "underground",
    slug: "never-told-anyone",
    title: "THINGS I'VE NEVER TOLD ANYONE",
    description: "say it here first",
    note: "In danger? Please reach a local helpline or someone you trust.",
  },
  { key: "love", slug: "talk-about-your-ex", title: "TALK ABOUT YOUR EX", description: "women and men spill" },
  { key: "ragebait", slug: "ragebait-me", title: "RAGEBAIT ME", description: "say the take that starts a fight" },
  { key: "wildest", slug: "wildest-thing", title: "THE WILDEST THING YOU'VE DONE", description: "no names. no judgment. just tell it" },
  {
    key: "students",
    slug: "student-secrets",
    title: "STUDENT SECRETS",
    description: "school, uni, everything in between",
    note: "No real names, schools or classes.",
  },
  {
    key: "crypto",
    slug: "crypto-confessions",
    title: "CRYPTO CONFESSIONS",
    description: "wins, losses, things you'd never tweet",
    note: "No shilling, no links. Stories, not advice.",
  },
];

export function roomLinkBySlug(slug: string): RoomLink | undefined {
  return ROOM_LINKS.find((room) => room.slug === slug);
}

export function roomLinkByKey(key: string): RoomLink | undefined {
  return ROOM_LINKS.find((room) => room.key === key);
}

export function roomLinkPath(key: string): string {
  const room = roomLinkByKey(key);
  return room ? `/r/${room.slug}` : "/read";
}
