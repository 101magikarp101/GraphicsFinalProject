const ADJECTIVES = ["Swift", "Bold", "Clever", "Brave", "Lucky", "Sneaky", "Mighty", "Chill"];
const NOUNS = ["Fox", "Bear", "Wolf", "Hawk", "Lynx", "Otter", "Raven", "Moose"];
const DEFAULT_PLAYER_NAME = "Player";
const MAX_PLAYER_NAME_LENGTH = 32;
const INVALID_PLAYER_NAME_CHARS = /[^\w\s-]/g;

/** Generates a random display name in the form `<Adjective><Noun><0-999>`. */
export function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 1000);
  return `${adj}${noun}${num}`;
}

export function sanitizePlayerName(name: unknown): string {
  const sanitized = String(name ?? "")
    .replace(INVALID_PLAYER_NAME_CHARS, "")
    .trim()
    .slice(0, MAX_PLAYER_NAME_LENGTH);
  return sanitized || DEFAULT_PLAYER_NAME;
}
