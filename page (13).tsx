'use client';

import React, { useMemo, Dispatch, SetStateAction } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';

interface SubItem {
  label: string;
  desc: string;
  href: string;
}

interface MenuItem {
  label: string;
  desc: string;
  href: string;
  icon: string;
  color?: string;
  subItems?: SubItem[];
  isPublic?: boolean;
}

interface SidebarProps {
  ruoloUtente?: 'SUPERADMIN' | 'USER';
  licenzaAttiva?: boolean;
  collapsed?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  activeRoute?: string;
  moduloAttivo?: string;
  setModuloAttivo?: Dispatch<SetStateAction<string>>;
}

export const Sidebar = ({
  ruoloUtente = 'USER',
  licenzaAttiva = false,
  collapsed = false,
  mobileOpen = false,
  onMobileClose = () => {},
  activeRoute,
  moduloAttivo = '',
  setModuloAttivo,
}: SidebarProps) => {
  const pathname = usePathname();
  const rottaAttuale = activeRoute || pathname;

  // Un utente naviga liberamente se è SUPERADMIN o se la licenza dello workspace è attiva
  const puoNavigare = ruoloUtente === 'SUPERADMIN' || licenzaAttiva;

  const vociMenu: MenuItem[] = [
    {
      label: 'Parametri di Sistema',
      desc: 'Localizzazione e soglie',
      href: '/superadmin/Parametri',
      icon: '⚙️',
    },
    {
      label: 'Licenze Commerciali',
      desc: 'Governano 1 o più spazi',
      href: '/superadmin/Licenze',
      icon: '🔑',
      isPublic: true,
    },
    {
      label: 'Spazi di Lavoro',
      desc: 'Creazione nuovo spazio',
      href: '/superadmin/Spazi',
      icon: '📁',
    },
    {
      label: 'Manutenzione Spazi',
      desc: 'Elenco ed ingresso spazi',
      href: '/superadmin/ManutenzioneSpazi',
      icon: '🛠️',
    },
  ];

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
        fixed inset-y-0 left-0 z-50 md:static flex flex-col justify-between p-4 font-mono text-xs
        h-screen bg-slate-950 text-slate-300 border-r border-slate-800 transition-all duration-300
        ${collapsed ? 'w-20' : 'w-80'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}
      >
        <div className="space-y-6 overflow-y-auto strict-scroll">
          {/* Header */}
          <div className="p-2 border-b border-slate-800 pb-4">
            <Logo variante={collapsed ? 'icon' : 'full'} dimensione={collapsed ? 28 : 30} />
            {!collapsed && (
              <div className="text-[10px] text-slate-500 mt-1.5 uppercase">
                Pannello {ruoloUtente}
              </div>
            )}
          </div>

          {/* Navigazione Principale */}
          <nav className="space-y-2">
            {vociMenu.map((item) => {
              // Il blocco si applica solo se la voce non è pubblica E l'utente non ha i permessi necessari
              const isBloccato = !item.isPublic && !puoNavigare;
              const isAttivo = rottaAttuale === item.href || moduloAttivo === item.label;

              if (isBloccato) {
                return (
                  <div
                    key={item.label}
                    className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/10 border border-transparent text-slate-600 cursor-not-allowed opacity-40 select-none"
                    title="Licenza non attiva o accesso ristretto"
                  >
                    <span className="text-sm">🔒</span>
                    {!collapsed && (
                      <div>
                        <span className="font-bold uppercase tracking-tight text-[11px]">
                          {item.label}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={() => {
                    if (mobileOpen) onMobileClose();
                    if (setModuloAttivo) setModuloAttivo(item.label);
                  }}
                  className={`flex items-center gap-2.5 p-3 rounded-xl transition-all border ${
                    collapsed ? 'justify-center' : ''
                  } ${
                    isAttivo
                      ? 'bg-blue-600 text-white font-bold shadow-md border-blue-500'
                      : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200 border-transparent'
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  {!collapsed && (
                    <div className="w-full overflow-hidden">
                      <span className="font-bold uppercase tracking-tight text-[11px] block truncate">
                        {item.label}
                      </span>
                      <span
                        className={`text-[9px] font-normal block truncate ${
                          isAttivo ? 'text-blue-200' : 'text-slate-500'
                        }`}
                      >
                        {item.desc}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Footer Widget con Stato Realistico */}
        <div className="p-3 border-t border-slate-800 pt-4 text-[10px] font-mono text-slate-500">
          {moduloAttivo && (
            <div className="mb-2 truncate">
              Modulo: <span className="text-blue-400 font-bold">{moduloAttivo}</span>
            </div>
          )}
          {!collapsed ? (
            <div className="bg-slate-900/60 p-2 rounded-xl border border-slate-900 space-y-1">
              <span className="text-slate-400 font-bold uppercase tracking-wider block">
                Stato Sessione
              </span>
              <div className="flex justify-between items-center">
                <span>Licenza Tenant:</span>
                <span className={`font-bold ${puoNavigare ? 'text-emerald-500' : 'text-red-500'}`}>
                  {puoNavigare ? 'ATTIVA' : 'BLOCCATA'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center text-lg">{puoNavigare ? '🟢' : '🔴'}</div>
          )}
        </div>
      </aside>
    </>
  );
};
