# V6 visual redesign

CSS-only: `public/redesign.css` (linked after `typography.css`). No markup, script, data, CSP-hash, API or translation changes.
Service worker cache bumped to `ar-cj-v6.0.0-redesign` and `redesign.css` added to the shell so installed PWAs pick it up.

Typography: Geist + Geist Mono (taste skill pick; replaces Schibsted Grotesk + IBM Plex Mono). Fonts are OFL, bundled in `public/fonts`.

Applied from the Emil Kowalski and taste skills: flat warm-neutral surfaces instead of glass blur and purple/blue gradients,
one accent (brand gold), no gradient text, labels above inputs, 50px fields with a clear focus ring, press feedback
(`scale(.97)`, 160ms ease-out), motion only on tracker progress/timeline, hover gated behind `(hover:hover)`,
transform/opacity-only animation, reduced-motion respected.

Known leftovers (not changed on purpose): emoji in section titles are part of JS strings that the EN translation table keys on;
`vso/index.html` (admin PDF generator) is not restyled.
