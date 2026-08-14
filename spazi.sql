'use client';

import Link from 'next/link';

export const dynamic = 'force-dynamic'; // Lascia solo questa riga!

export default function NotFound() {
  return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>404 - Pagina non trovata</h1>
      <p>Ci dispiace, la risorsa richiesta non esiste.</p>
      <Link href="/" style={{ color: '#0078d4' }}>
        Torna alla Dashboard
      </Link>
    </div>
  );
}
