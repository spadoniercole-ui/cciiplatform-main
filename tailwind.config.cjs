/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/app/**/*.{js,ts,jsx,tsx,mdx}', './src/components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      // "Misuriamo il battito del tuo business" — non un'estensione
      // isolata (brand.*), ma le scale STESSE che l'app usa già
      // ovunque (slate, blue, emerald, amber, red, purple): ogni
      // bg-blue-600 o text-slate-500 già scritto in centinaia di
      // componenti eredita questa identità senza dover toccare un
      // solo file. Costruite in OKLCH per uniformità percettiva, ogni
      // famiglia condivide lo stesso hue dei 4 colori di partenza (o
      // un hue armonizzato per gli stati — successo/allerta/critico —
      // che prima erano il verde/ambra/rosso generico di Tailwind,
      // scollegati dal resto).
      colors: {
        brand: {
          analisi: 'oklch(0.55 0.14 220)',
          notte: 'oklch(0.25 0.02 250)',
          impulso: 'oklch(0.7 0.14 30)',
          carta: 'oklch(0.97 0.005 250)',
        },
        // Neutro — hue di Blu Notte (250), croma minima: un grigio
        // che non è mai davvero grigio, sempre con un sottofondo blu
        // freddo coerente col resto.
        slate: {
          50: 'oklch(0.985 0.003 250)',
          100: 'oklch(0.965 0.005 250)',
          200: 'oklch(0.915 0.008 250)',
          300: 'oklch(0.83 0.01 250)',
          400: 'oklch(0.65 0.014 250)',
          500: 'oklch(0.53 0.016 250)',
          600: 'oklch(0.44 0.018 250)',
          700: 'oklch(0.36 0.018 250)',
          800: 'oklch(0.28 0.018 250)',
          900: 'oklch(0.22 0.02 250)',
          950: 'oklch(0.15 0.02 250)',
        },
        // Primario — Blu Analisi (600 è il valore di marca esatto).
        blue: {
          50: 'oklch(0.97 0.02 220)',
          100: 'oklch(0.93 0.035 220)',
          200: 'oklch(0.87 0.06 220)',
          300: 'oklch(0.78 0.09 220)',
          400: 'oklch(0.68 0.12 220)',
          500: 'oklch(0.6 0.14 220)',
          600: 'oklch(0.55 0.14 220)',
          700: 'oklch(0.47 0.13 220)',
          800: 'oklch(0.39 0.11 220)',
          900: 'oklch(0.32 0.09 220)',
          950: 'oklch(0.22 0.06 220)',
        },
        // "Vitale" — esito positivo, verde clinico (non il verde
        // brillante da semaforo di Tailwind), stessa curva delle
        // altre famiglie.
        emerald: {
          50: 'oklch(0.97 0.02 155)',
          100: 'oklch(0.93 0.05 155)',
          200: 'oklch(0.87 0.08 155)',
          300: 'oklch(0.78 0.11 155)',
          400: 'oklch(0.7 0.13 155)',
          500: 'oklch(0.63 0.145 155)',
          600: 'oklch(0.56 0.14 155)',
          700: 'oklch(0.47 0.12 155)',
          800: 'oklch(0.39 0.1 155)',
          900: 'oklch(0.32 0.08 155)',
          950: 'oklch(0.22 0.05 155)',
        },
        // "Allerta" — imparentato con Corallo Impulso ma spostato più
        // verso il giallo (hue 75 contro 30), per restare
        // distinguibile dall'accento invece di confondersi con esso.
        amber: {
          50: 'oklch(0.97 0.03 80)',
          100: 'oklch(0.94 0.06 80)',
          200: 'oklch(0.88 0.09 78)',
          300: 'oklch(0.81 0.12 76)',
          400: 'oklch(0.75 0.14 75)',
          500: 'oklch(0.7 0.15 72)',
          600: 'oklch(0.62 0.15 60)',
          700: 'oklch(0.52 0.14 50)',
          800: 'oklch(0.42 0.12 45)',
          900: 'oklch(0.35 0.1 40)',
          950: 'oklch(0.24 0.07 35)',
        },
        // "Critico" — rosso clinico controllato, non lo scarlatto
        // acceso da form-di-errore generico.
        red: {
          50: 'oklch(0.97 0.02 25)',
          100: 'oklch(0.93 0.045 25)',
          200: 'oklch(0.86 0.08 25)',
          300: 'oklch(0.77 0.13 25)',
          400: 'oklch(0.68 0.17 25)',
          500: 'oklch(0.6 0.19 25)',
          600: 'oklch(0.54 0.19 25)',
          700: 'oklch(0.46 0.17 25)',
          800: 'oklch(0.38 0.14 25)',
          900: 'oklch(0.32 0.11 25)',
          950: 'oklch(0.2 0.07 25)',
        },
        // Viola — riservato ai momenti "AI" (Screening, Relazione):
        // un hue distinto (289) ma con la stessa curva di croma delle
        // altre famiglie, per non sembrare un colore preso da
        // un'altra palette.
        purple: {
          50: 'oklch(0.97 0.02 295)',
          100: 'oklch(0.93 0.045 295)',
          200: 'oklch(0.86 0.08 295)',
          300: 'oklch(0.76 0.12 293)',
          400: 'oklch(0.66 0.16 291)',
          500: 'oklch(0.58 0.19 289)',
          600: 'oklch(0.52 0.2 287)',
          700: 'oklch(0.44 0.19 286)',
          800: 'oklch(0.37 0.16 285)',
          900: 'oklch(0.3 0.13 284)',
          950: 'oklch(0.2 0.09 283)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        // La firma visiva del brand (il tracciato ECG nel logo) usata
        // come indicatore di caricamento in tutta l'app — non più il
        // generico pallore/opacità di animate-pulse.
        battito: {
          '0%, 100%': { strokeDashoffset: '0' },
          '50%': { strokeDashoffset: '-40' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        battito: 'battito 1.4s ease-in-out infinite',
        'fade-in': 'fade-in 0.25s ease-out',
      },
    },
  },
  plugins: [],
};
