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
  /** For limited rooms: when posting opens and closes (ISO, UTC). Outside
   * that window the room can be read but not posted in. */
  opensAt?: string;
  closesAt?: string;
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
  {
    key: "haunted",
    slug: "haunted",
    title: "THINGS THAT HAUNT ME",
    description: "halloween only. say what keeps you up at night",
    note: "Open now, until Halloween ends. No real names, and nothing that points to a real person.",
    // Halloween has ended everywhere (midnight at UTC-12).
    closesAt: "2026-11-01T12:00:00Z",
  },
];

export function roomLinkBySlug(slug: string): RoomLink | undefined {
  return ROOM_LINKS.find((room) => room.slug === slug);
}

export function roomLinkByKey(key: string): RoomLink | undefined {
  return ROOM_LINKS.find((room) => room.key === key);
}

/** Why a limited room isn't taking posts right now, or null when it is. */
export function roomClosedReason(room: RoomLink, now = Date.now()): string | null {
  if (room.opensAt && now < Date.parse(room.opensAt)) {
    return "This room opens Thursday 29 October at 20:00 UTC. Nothing can be posted until then.";
  }
  if (room.closesAt && now >= Date.parse(room.closesAt)) {
    return "Halloween is over. This room is closed to new posts, but you can still read it.";
  }
  return null;
}

/** The note shown at the top of a room: its open/closed state, else its usual note. */
export function roomNote(room: RoomLink, now = Date.now()): string | undefined {
  return roomClosedReason(room, now) ?? room.note;
}

export function roomLinkPath(key: string): string {
  const room = roomLinkByKey(key);
  return room ? `/r/${room.slug}` : "/read";
}
