import Link from 'next/link';
import { FileSpreadsheet, TrendingUp } from 'lucide-react';

// Sotto-navigazione dello step "Analisi Bilancio": raggruppa Configurazione
// XBRL e Indici sotto un'unica voce (come Posizione Ente ha le sue due
// sotto-schede). Server component: solo link, nessuno stato client.

interface Props {
  base: string; // es. /spazio/CODICE/aziende/3
  attivo: 'xbrl' | 'indici';
}

export function SottoNavAnalisiBilancio({ base, attivo }: Props) {
  const voci: { id: 'xbrl' | 'indici'; label: string; icon: typeof FileSpreadsheet }[] = [
    { id: 'xbrl', label: 'Configurazione XBRL', icon: FileSpreadsheet },
    { id: 'indici', label: 'Indici', icon: TrendingUp },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Analisi Bilancio
        </h2>
      </div>
      <div className="flex gap-2">
        {voci.map((v) => {
          const Icon = v.icon;
          const isAttivo = v.id === attivo;
          return (
            <Link
              key={v.id}
              href={`${base}/${v.id}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                isAttivo
                  ? 'bg-blue-600 border-blue-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {v.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
