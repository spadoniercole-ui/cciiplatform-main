'use client';

// Sidebar del Pannello Spazio. Dashboard, Aziende, Utenti, Parametri di
// Spazio sono a livello di spazio e riservati all'Admin (mai visibili a un
// Operatore/Consultatore). Scenari (e le sue sotto-pagine Check List,
// Indici, XBRL, Report) sono filtrati per un Operatore in base ai suoi
// permessi reali (permessi_utente) — la STESSA fonte che il controllo
// d'accesso di ogni pagina userà per bloccare l'accesso diretto via URL:
// un solo posto dove i permessi sono definiti, non un elenco "spento"
// solo nell'interfaccia mentre il server lascia passare comunque.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Building2, Users, FolderOpen, Settings2, BookOpen } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';

type LivelloPermesso = 'NESSUNO' | 'LETTURA' | 'SCRITTURA';

interface Props {
  codice: string;
  descrizione: string;
  modalita: 'SALVAGENTE' | 'ADMIN_SPAZIO' | 'OPERATORE';
  /** Solo per modalita === 'OPERATORE': permessi per modulo. */
  permessi?: Record<string, LivelloPermesso>;
}

type StatoVoce = 'pronta' | 'parziale' | 'presto';

const VOCI_MENU: {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  stato: StatoVoce;
  soloAdmin: boolean;
  modulo?: string;
}[] = [
  { id: '', label: 'Dashboard', icon: LayoutDashboard, stato: 'pronta', soloAdmin: false },
  {
    id: 'parametri',
    label: 'Parametri di Spazio',
    icon: Settings2,
    stato: 'pronta',
    soloAdmin: true,
  },
  { id: 'utenti', label: 'Utenti', icon: Users, stato: 'pronta', soloAdmin: true },
  { id: 'aziende', label: 'Aziende', icon: Building2, stato: 'pronta', soloAdmin: true },
  {
    id: 'scenari',
    label: 'Scenari',
    icon: FolderOpen,
    stato: 'pronta',
    soloAdmin: false,
    modulo: 'scenari',
  },
  { id: 'normativa', label: 'Normativa CCII', icon: BookOpen, stato: 'pronta', soloAdmin: false },
];

export function SidebarSpazio({ codice, descrizione, modalita, permessi }: Props) {
  const pathname = usePathname();
  const base = `/spazio/${codice}`;

  const vociVisibili = VOCI_MENU.filter((voce) => {
    if (modalita !== 'OPERATORE') return true; // Salvagente e Admin vedono tutto
    if (voce.soloAdmin) return false; // Gestione dello spazio: mai a un Operatore
    if (!voce.modulo) return true; // Dashboard, Normativa: nessun permesso specifico richiesto
    return (permessi?.[voce.modulo] || 'NESSUNO') !== 'NESSUNO';
  });

  const etichettaModalita =
    modalita === 'SALVAGENTE'
      ? 'Modalità Salvagente'
      : modalita === 'ADMIN_SPAZIO'
        ? 'Admin di Spazio'
        : 'Operatore';

  return (
    <aside className="w-64 shrink-0 bg-slate-950 text-slate-300 h-screen flex flex-col border-r border-slate-800">
      <div className="p-4 border-b border-slate-800">
        <Logo variante="icon" dimensione={26} className="mb-2" />
        <div className="text-white font-black text-sm tracking-wider uppercase truncate">
          {descrizione}
        </div>
        <div className="text-[10px] text-slate-500 font-mono mt-0.5">{codice}</div>
        <div
          className={`mt-2 inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${
            modalita === 'SALVAGENTE'
              ? 'bg-amber-900/40 text-amber-400'
              : modalita === 'ADMIN_SPAZIO'
                ? 'bg-blue-900/40 text-blue-400'
                : 'bg-emerald-900/40 text-emerald-400'
          }`}
        >
          {etichettaModalita}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {vociVisibili.map((voce) => {
          const href = voce.id ? `${base}/${voce.id}` : base;
          const attivo = voce.id === 'scenari' ? pathname.startsWith(href) : pathname === href;
          const Icon = voce.icon;
          const soloLettura =
            modalita === 'OPERATORE' && voce.modulo && permessi?.[voce.modulo] === 'LETTURA';

          return (
            <Link
              key={voce.id || 'dashboard'}
              href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                attivo
                  ? 'bg-blue-600 text-white'
                  : voce.stato === 'presto'
                    ? 'text-slate-600 hover:bg-slate-900/50'
                    : 'text-slate-300 hover:bg-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{voce.label}</span>
              {voce.stato === 'presto' && (
                <span className="text-[8px] uppercase tracking-wider text-slate-600">Presto</span>
              )}
              {voce.stato === 'parziale' && (
                <span className="text-[8px] uppercase tracking-wider text-amber-500">Parziale</span>
              )}
              {soloLettura && (
                <span className="text-[8px] uppercase tracking-wider text-slate-500">
                  Sola lettura
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
