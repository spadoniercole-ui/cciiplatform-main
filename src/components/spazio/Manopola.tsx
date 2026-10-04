'use client';

// MANOPOLA — controllo rotativo del cruscotto del piano. Si gira trascinando
// in verticale (o in orizzontale), con le frecce della tastiera, o scrivendo
// il valore nel campo sotto; doppio clic = torna al valore di riposo.
// L'arco colorato riflette lo stato GLOBALE del piano (come i semafori delle
// vecchie levette): girando una manopola si vede subito se il piano regge.

import React, { useRef } from 'react';

interface Props {
  etichetta: string;
  valore: number;
  min: number;
  max: number;
  passo: number;
  neutro: number;
  unita: string;
  aiuto?: string;
  /** Colore dell'arco: stato globale del piano. */
  stato: 'ok' | 'attenzione' | 'critico';
  /** Le ipotesi sotto la manopola variano per anno: il valore è la media. */
  variaPerAnno?: boolean;
  daAi?: boolean;
  disabilitata?: boolean;
  /**
   * Ricevente: fasce colorate sotto la manopola, una per serie (azienda,
   * sistema): lo scostamento della serie rettificata dal riferimento di
   * settore, verde / giallo / rosso con le soglie dell'ente.
   */
  fasce?: { etichetta: string; luce: 'verde' | 'giallo' | 'rosso' | 'nc' }[];
  onChange: (v: number) => void;
}

const COLORE_FASCIA = {
  verde: 'bg-emerald-500',
  giallo: 'bg-amber-400',
  rosso: 'bg-red-500',
  nc: 'bg-slate-200',
};
const TESTO_FASCIA = {
  verde: 'entro soglia o prudente',
  giallo: 'ottimista oltre la soglia verde',
  rosso: 'ottimista oltre la soglia gialla',
  nc: 'non confrontabile con il settore',
};

const COLORE = { ok: '#059669', attenzione: '#d97706', critico: '#dc2626' };
const INIZIO = 135; // gradi: arco da 135° a 405° (270° di corsa)
const CORSA = 270;

function punto(cx: number, cy: number, r: number, gradi: number) {
  const rad = (gradi * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}
function arco(cx: number, cy: number, r: number, da: number, a: number) {
  if (a - da < 0.01) return '';
  const p1 = punto(cx, cy, r, da);
  const p2 = punto(cx, cy, r, a);
  const grande = a - da > 180 ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${r} ${r} 0 ${grande} 1 ${p2.x} ${p2.y}`;
}

const formatta = (v: number, unita: string) =>
  unita.startsWith('€')
    ? Math.round(v).toLocaleString('it-IT')
    : `${v > 0 && unita.startsWith('% l') ? '+' : ''}${v.toLocaleString('it-IT', { maximumFractionDigits: 1 })}`;

export function Manopola({
  etichetta,
  valore,
  min,
  max,
  passo,
  neutro,
  unita,
  aiuto,
  stato,
  variaPerAnno,
  daAi,
  disabilitata,
  fasce,
  onChange,
}: Props) {
  const trascina = useRef<{ y: number; x: number; v: number } | null>(null);
  const limita = (v: number) => {
    const q = Math.round((v - min) / passo) * passo + min;
    return Math.max(min, Math.min(max, Math.round(q * 100) / 100));
  };
  const frazione = (v: number) => (Math.max(min, Math.min(max, v)) - min) / (max - min || 1);
  const angolo = INIZIO + frazione(valore) * CORSA;
  const angoloNeutro = INIZIO + frazione(neutro) * CORSA;
  const lancetta = punto(40, 40, 24, angolo);
  const colore = COLORE[stato];

  return (
    <div
      className={`flex flex-col items-center text-center w-24 ${disabilitata ? 'opacity-50' : ''}`}
      title={aiuto}
    >
      <svg
        width="80"
        height="72"
        viewBox="0 0 80 74"
        role="slider"
        tabIndex={disabilitata ? -1 : 0}
        aria-label={etichetta}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={valore}
        aria-valuetext={`${formatta(valore, unita)} ${unita}`}
        className="cursor-ns-resize touch-none select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-full"
        onPointerDown={(e) => {
          if (disabilitata) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          trascina.current = { y: e.clientY, x: e.clientX, v: valore };
        }}
        onPointerMove={(e) => {
          const t = trascina.current;
          if (!t) return;
          // 160 px di trascinamento = corsa intera.
          const delta = (t.y - e.clientY + (e.clientX - t.x)) / 160;
          onChange(limita(t.v + delta * (max - min)));
        }}
        onPointerUp={() => (trascina.current = null)}
        onPointerCancel={() => (trascina.current = null)}
        onDoubleClick={() => !disabilitata && onChange(neutro)}
        onKeyDown={(e) => {
          if (disabilitata) return;
          const molt = e.shiftKey ? 10 : 1;
          if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
            e.preventDefault();
            onChange(limita(valore + passo * molt));
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
            e.preventDefault();
            onChange(limita(valore - passo * molt));
          } else if (e.key === 'Home') onChange(min);
          else if (e.key === 'End') onChange(max);
          else if (e.key === '0' || e.key === 'Escape') onChange(neutro);
        }}
      >
        <path
          d={arco(40, 40, 30, INIZIO, INIZIO + CORSA)}
          stroke="#e2e8f0"
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={arco(40, 40, 30, Math.min(angolo, angoloNeutro), Math.max(angolo, angoloNeutro))}
          stroke={colore}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
        />
        {/* tacca del valore di riposo */}
        {(() => {
          const a = punto(40, 40, 36, angoloNeutro);
          const b = punto(40, 40, 25, angoloNeutro);
          return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#94a3b8" strokeWidth="1.5" />;
        })()}
        <circle cx="40" cy="40" r="19" fill="#0f172a" />
        <line
          x1="40"
          y1="40"
          x2={lancetta.x}
          y2={lancetta.y}
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <text x="40" y="72" textAnchor="middle" fontSize="8" fill="#94a3b8">
          {variaPerAnno ? 'media' : ''}
        </text>
      </svg>
      <div className="flex items-baseline justify-center gap-0.5 -mt-1">
        <input
          type="number"
          step={passo}
          min={min}
          max={max}
          value={Number.isFinite(valore) ? valore : ''}
          disabled={disabilitata}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
          className="w-20 text-center text-xs font-bold text-slate-900 bg-transparent border-b border-slate-200 focus:border-blue-400 focus:outline-none tabular-nums"
          aria-label={`${etichetta} — valore`}
        />
      </div>
      <span className="text-[9px] text-slate-400">{unita}</span>
      <span className="text-[10px] font-bold text-slate-700 leading-tight mt-0.5">
        {etichetta}
        {daAi && (
          <span className="ml-1 text-violet-600" title="Valori scritti dall’AI">
            AI
          </span>
        )}
      </span>
      {fasce && fasce.length > 0 && (
        <div className="w-full mt-1 space-y-0.5">
          {fasce.map((f) => (
            <div
              key={f.etichetta}
              className="flex items-center gap-1"
              title={`${f.etichetta}: ${TESTO_FASCIA[f.luce]}`}
            >
              <span className="text-[8px] text-slate-500 w-8 text-left">{f.etichetta}</span>
              <span className={`flex-1 h-1.5 rounded-full ${COLORE_FASCIA[f.luce]}`} />
            </div>
          ))}
        </div>
      )}
      {variaPerAnno && (
        <span className="text-[9px] text-amber-700 leading-tight">
          diversa per anno: girando la uniformi
        </span>
      )}
    </div>
  );
}
