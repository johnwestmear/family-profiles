// Emoji offered on the settings page. Tiles for each emoji x colour are
// pre-rendered into public/posters by scripts/build-posters.mjs.
export const EMOJI = [
  "😀","😎","🤠","🥳","🤓","😺","🐶","🦊",
  "🐼","🐨","🦁","🐯","🐸","🐵","🦄","🐙",
  "🦖","🐢","🐬","🦋","🐝","🐧","🦈","🐴",
  "🌈","⭐","🔥","🌊","🌸","🍕","🍩","🍦",
  "⚽","🏀","🏉","🏏","🎮","🎸","🎨","🚀",
  "🚗","🏄","👑","🤖","👻","💎","🎧",
];
export const COLOURS = ["e50914", "1f80e0", "2fb36b", "f5a623", "9b51e0", "e84393", "00a8a8", "6c757d"];
export function emojiCode(e) {
  return [...e].map((c) => c.codePointAt(0).toString(16)).filter((h) => h !== "fe0f").join("-");
}
