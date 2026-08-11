'use client';

import React, { useState } from 'react';
import type { AnalisiXbrlResult } from '@/lib/xbrl/types';

interface Props {
  /** Chiamato con il risultato completo appena l'analisi ha successo. */
  onAnalisiCompletata: (risultato: AnalisiXbrlResult) => void;
}

type Stato = 'IDLE' | 'UPLOADING' | 'ERROR';

export function XbrlUploadComponent({ onAnalisiCompletata }: Props) {
  const [stato, setStato] = useState<Stato>('IDLE');
  const [errore, setErrore] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setStato('UPLOADING');
    setErrore(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/xbrl/parse', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setStato('ERROR');
        setErrore(result.error || `Errore del server: ${response.status}`);
        return;
      }

      setStato('IDLE');
      onAnalisiCompletata(result as AnalisiXbrlResult);
    } catch (err: any) {
      console.error('Errore durante la chiamata API:', err);
      setStato('ERROR');
      setErrore('Impossibile completare la richiesta. Verifica la connessione.');
    }
  };

  return (
    <div className="p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-500 transition-colors space-y-3">
      <label className="flex flex-col items-center cursor-pointer">
        <span className="text-sm font-bold text-gray-700 mb-2">
          {stato === 'UPLOADING' ? 'Analisi in corso...' : 'Carica File XBRL'}
        </span>
        <input
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleUpload(file);
            e.target.value = '';
          }}
          accept=".xbrl,.xml"
          disabled={stato === 'UPLOADING'}
        />
      </label>

      {stato === 'ERROR' && errore && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
          {errore}
        </div>
      )}
    </div>
  );
}
