// Identity depends only on the material name, so filtering or sorting never changes it.
const colors = [
  ['#4338ca', '#eef2ff'], ['#0369a1', '#e0f2fe'],
  ['#047857', '#d1fae5'], ['#a16207', '#fef3c7'],
  ['#be185d', '#fce7f3'], ['#7e22ce', '#f3e8ff'],
  ['#c2410c', '#ffedd5'], ['#0f766e', '#ccfbf1'],
];
const emojis = ['🌿', '🌸', '☀️', '🌙', '⭐', '🔥', '💎', '🎯', '🎬', '🎨', '🧩', '🚀', '🍀', '🌊', '🦋', '🎵'];
export function creativeIdentity(name = '') {
  const key = name.normalize('NFKC').trim().replace(/\s+/g, ' ') || '소재명 미입력';
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0;
  const [color, background] = colors[hash % colors.length];
  return { key, color, background, emoji: emojis[Math.floor(hash / colors.length) % emojis.length] };
}
