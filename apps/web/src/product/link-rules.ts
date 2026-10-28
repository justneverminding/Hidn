// Links aren't allowed anywhere on HIDN. The rule is shared: the server applies
// it to posts and replies, and the sender's browser applies it to end-to-end
// encrypted link messages, which the server can't read.

const LINK_PATTERN = new RegExp(
  [
    String.raw`(?:https?|hxxps?):\/\/\S+`,
    String.raw`\bwww\.\S+`,
    String.raw`\bt\.me\/\S+`,
    String.raw`\b[a-z0-9][a-z0-9-]{0,62}\.(?:com|net|org|io|xyz|app|co|me|ly|gg|link|finance|exchange|dev|ai|info|biz|tv|to|sh|so|fi|money|eth|crypto|site|online|store|shop|live|club|top|vip|pro|bio|page|art|nft|dao|cc|us|uk|ng|in|ru|cn|de)\b`,
  ].join("|"),
  "i",
);

export const LINK_BLOCKED_ERROR = "Links aren't allowed on HIDN. Say it in words.";

export function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text);
}
