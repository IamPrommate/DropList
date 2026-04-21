/** CSS variables written to <html> inline style by album color extraction. Removing them restores the default purple theme from layout.scss. */
export const ALBUM_THEME_VARS = [
  '--bg-gradient-start',
  '--bg-gradient-middle',
  '--bg-gradient-end',
  '--switch-bg',
  '--switch-border',
  '--switch-checked-bg',
  '--switch-checked-border',
  '--switch-hover',
  '--switch-checked-hover',
  '--shadow-primary',
  '--shadow-primary-glow',
  '--playlist-active-shadow',
  '--player-border',
  '--primary-gradient-start',
  '--primary-gradient-middle',
  '--primary-gradient-end',
  '--primary-gradient-hover-start',
  '--primary-gradient-hover-middle',
  '--primary-gradient-hover-end',
] as const;

export function clearAlbumTheme(): void {
  for (const v of ALBUM_THEME_VARS) {
    document.documentElement.style.removeProperty(v);
  }
}
