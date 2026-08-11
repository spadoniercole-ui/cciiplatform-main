'use client';

import React, { useRef, useState } from 'react';

interface XbrlHeaderUploadProps {
  currentFileName?: string | null;
  tenantId: string;
  onUploadSuccess: (data: any) => void;
}

export function XbrlHeaderUpload({
  currentFileName,
  tenantId,
  onUploadSuccess,
}: XbrlHeaderUploadProps) {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('tenantId', tenantId);

    try {
      const res = await fetch('/api/xbrl/parse', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();
      if (res.ok && result.success) {
        onUploadSuccess(result);
      } else {
        alert(`Errore nel caricamento: ${result.error || 'File non valido'}`);
      }
    } catch (err) {
      console.error('Upload Error:', err);
      alert("Errore di connessione durante l'upload del file.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-3 font-mono text-xs">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xbrl,.xml"
        className="hidden"
      />

      {currentFileName ? (
        <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-md text-slate-200">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="truncate max-w-[180px]" title={currentFileName}>
            {currentFileName}
          </span>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="ml-2 text-blue-400 hover:text-blue-300 underline disabled:opacity-50"
          >
            {loading ? 'Caricamento...' : 'Sostituisci'}
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          {loading ? 'Elaborazione XBRL...' : 'Carica File XBRL'}
        </button>
      )}
    </div>
  );
}
