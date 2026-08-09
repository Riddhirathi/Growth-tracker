/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#29213b',
    tint: '#ee7c48',

    // Core surfaces
    background: '#f5eee4',
    foreground: '#29213b',

    // Cards / elevated surfaces
    card: '#fffaf4',
    cardForeground: '#29213b',

    // Primary action color (buttons, links, active states)
    primary: '#ee7c48',
    primaryForeground: '#fffaf4',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#e7f0e8',
    secondaryForeground: '#254c49',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#e9dfd4',
    mutedForeground: '#897775',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#4b8981',
    accentForeground: '#fffaf4',

    // Destructive actions (delete, error states)
    destructive: '#c85b4f',
    destructiveForeground: '#fffaf4',

    // Borders and input outlines
    border: '#dfd1c4',
    input: '#dfd1c4',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 14,
};

export default colors;
