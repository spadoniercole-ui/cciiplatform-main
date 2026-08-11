'use client';

import { useState, useEffect } from 'react';

export const dynamic = 'force-dynamic';

export default function SetupLicenzaPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>🏢 Gestione Spazi (Tenant)</h1>
        <p style={styles.subtitle}>
          Visualizza, monitora e gestisci gli spazi di lavoro attivi associati alle licenze.
        </p>
      </div>

      <div style={styles.card}>
        <div style={styles.emptyState}>
          <p style={styles.placeholderText}>
            Qui verranno elencati i Tenant agganciati alle licenze commerciali.
          </p>
        </div>
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
  emptyState: {
    textAlign: 'center' as const,
    padding: '20px 0',
  },
  placeholderText: {
    color: '#9ca3af',
    fontSize: '14px',
    fontWeight: '500',
  },
};
