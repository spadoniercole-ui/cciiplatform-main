'use client';

import { useState, useEffect } from 'react';

import dynamic from 'next/dynamic';

// Importa i componenti in modo dinamico per isolarli ulteriormente
const LicenseManager = dynamic(() => import('./components/LicenseManager'), { ssr: false });
const SystemParamsManager = dynamic(() => import('./components/SystemParamsManager'), {
  ssr: false,
});

export default function CciiDashboardPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div style={styles.container}>
      <h1>Dashboard CCII</h1>
      <LicenseManager />
      <SystemParamsManager />
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
};
