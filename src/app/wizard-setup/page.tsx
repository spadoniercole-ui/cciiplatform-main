'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

// QUESTA RIGA È IL FIX PER IL BUILD:

export default function WizardSetupPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Questo assicura che il server non provi a renderizzare il contenuto durante il build
  if (!mounted) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>⚡ Configurazione Guidata</h1>
        <p style={styles.subtitle}>Configura i parametri iniziali del sistema.</p>
      </div>

      <div style={styles.card}>
        {/* Inserisci qui il contenuto del tuo Wizard */}
        <p>Il contenuto del wizard verrà renderizzato qui.</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '40px',
    fontFamily: 'Arial, sans-serif',
    backgroundColor: '#f9fafb',
    minHeight: '100vh',
  },
  header: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#111827',
    marginBottom: '8px',
  },
  subtitle: {
    fontSize: '14px',
    color: '#4b5563',
  },
  card: {
    backgroundColor: '#ffffff',
    padding: '40px',
    borderRadius: '8px',
    border: '1px solid #e5e7eb',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  },
};
