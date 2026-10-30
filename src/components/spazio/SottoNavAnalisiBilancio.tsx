import Link from 'next/link';
import { FileSpreadsheet, FileUp, TrendingUp } from 'lucide-react';

// Sotto-navigazione dello step "Analisi Bilancio": raggruppa il caricamento
// dei bilanci, la configurazione delle tab e gli indici sotto un'unica voce
// (come Posizione Ente ha le sue sotto-schede). Server component: solo link,
// nessuno stato client.
//
// "Bilanci XBRL" è una scheda a sé e non un riquadro dentro Configurazione:
// il caricamento ammette più file in un colpo solo e ha un elenco di esiti
// suo, che in mezzo ai checkbox delle tab non si leggeva.

interface Props {
  base: string; // es. /spazio/CODICE/aziende/3
  attivo: 'xbrl' | 'indici' | 'bilanci';
}

export function SottoNavAnalisiBilancio({ base, attivo }: Props) {
  const voci: { id: 'xbrl' | 'indici' | 'bilanci'; label: string; icon: typeof FileSpreadsheet }[] =
    [
      { id: 'bilanci', label: 'Bilanci XBRL', icon: FileUp },
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
