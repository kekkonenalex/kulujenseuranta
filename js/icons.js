// ============================================================
//  The app's icons, drawn for it (D4): thin strokes on a 24 grid, the same weight as the type. The
//  month is rays, the list is lines, Otso is the bear. Not an icon set.
// ============================================================

const PATHS = {
  month: '<path d="M5 20V12M9 20V6M13 20v-9M17 20V8M21 20v-4M3 20h20"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  bear: '<circle cx="6.5" cy="6.5" r="2.6"/><circle cx="17.5" cy="6.5" r="2.6"/><path d="M12 5.5c4.7 0 7.6 3 7.6 7 0 2.8-1.3 4.7-3.2 5.8l-1.5.9c-.9.6-1.9.8-2.9.8s-2-.2-2.9-.8l-1.5-.9C5.7 17.2 4.4 15.3 4.4 12.5c0-4 2.9-7 7.6-7z"/><path d="M10.6 14h2.8L12 15.7z" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  flag: '<path d="M6 21V4M6 4h11l-2.5 4L17 12H6"/>',
  undo: '<path d="M9 5L5 9l4 4"/><path d="M5 9h9a5 5 0 010 10h-4"/>',
  drag: '<path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" stroke-width="3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
};

/** An icon as inline SVG. Decorative unless given a label. */
export function icon(name, { label = '', size = 22 } = {}) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${PATHS[name] || ''}</svg>`;
}

/** The Kulta bear, in rays (the app's mark). */
let marks = 0;

export function mark(size = 28, { full = false } = {}) {
  const id = `m${marks += 1}`; // (ids of their own: a mark inside a hidden screen would break the others' clip)
  const rays = Array.from({ length: 16 }, (_, i) => `<rect x="${10 + i * 5}" width="2.4" height="100"/>`).join('');
  return `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <defs><clipPath id="${id}-bear"><circle cx="24" cy="26" r="13"/><circle cx="76" cy="26" r="13"/>
      <path d="M50 22c22 0 36 14 36 33 0 13-6 22-15 27l-7 4c-4 3-9 4-14 4s-10-1-14-4l-7-4C20 77 14 68 14 55c0-19 14-33 36-33z"/></clipPath>
      <linearGradient id="${id}-ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F7C25A"/><stop offset="1" stop-color="#D9772F" stop-opacity="${full ? '.85' : '.6'}"/></linearGradient></defs>
    <g clip-path="url(#${id}-bear)" fill="url(#${id}-ray)">${rays}</g><path d="M43 62h14l-7 8z" fill="#000"/></svg>`;
}
