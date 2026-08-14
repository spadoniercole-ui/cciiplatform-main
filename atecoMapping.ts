/* src/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  padding: 0;
  background-color: oklch(
    0.15 0.02 250
  ); /* slate-950 della nuova palette, non più un hex isolato */
  color: white;
  font-family: var(--font-body), system-ui, sans-serif;
  font-feature-settings: 'tnum' 1; /* cifre tabellari di default — importi e percentuali allineati in colonna */
}

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: var(--font-display), system-ui, sans-serif;
}

/* Focus sempre visibile — mai rimosso, solo ridisegnato nel colore di
   marca invece del contorno blu di sistema. */
:focus-visible {
  outline: 2px solid oklch(0.55 0.14 220);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
