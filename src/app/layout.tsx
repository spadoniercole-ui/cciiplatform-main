import './globals.css';
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';

// Tre ruoli distinti, non la stessa famiglia riadattata ovunque:
// Space Grotesk per i titoli (carattere tecnico, da strumento di
// precisione — coerente con "misuriamo il battito del tuo business",
// non un generico sans da SaaS), IBM Plex Sans per il corpo (più
// personalità di Inter, resta leggibile nelle tabelle dense di questa
// piattaforma), IBM Plex Mono per le cifre — in un'app piena di
// importi e percentuali, i numeri tabellari in monospace si allineano
// in colonna invece di "ballare" a seconda delle cifre.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="it"
      className={`${spaceGrotesk.variable} ${ibmPlexSans.variable} ${ibmPlexMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
