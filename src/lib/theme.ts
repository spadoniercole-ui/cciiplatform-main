// src/lib/theme.ts

export const THEME = {
  // Sfondo globale dell'intera applicazione
  bodyBackground: 'bg-slate-50 min-h-screen text-slate-900 antialiased',

  // Il "Rettangolo di Azione" core (le schede bianche dove vive l'applicazione)
  canvas: 'bg-white rounded-xl border border-slate-200 shadow-sm p-6 md:p-8',

  // Struttura dei contenitori principali della Dashboard
  sidebar:
    'w-64 bg-slate-900 text-slate-200 min-h-screen flex flex-col fixed left-0 top-0 border-r border-slate-800 z-20',
  header:
    'h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 fixed top-0 right-0 left-64 z-10 shadow-sm',
  mainLayout: 'pt-24 pl-72 pr-8 pb-8 bg-slate-50 min-h-screen', // Calcola lo spazio per non sovrapporsi a sidebar e header

  // Mappa di Login (Rettangolo isolato e centrato)
  loginCard: 'w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8 space-y-6',

  // Elementi dei Form standardizzati
  label: 'block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2',

  // Campo di testo / Input numerici
  input:
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-950 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all',

  // Combo Box / Select
  combo:
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm text-slate-950 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-all cursor-pointer',

  // Pulsanti operativi
  buttonPrimary:
    'px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:opacity-50',
  buttonSecondary:
    'px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-sm rounded-lg border border-slate-300 shadow-sm transition-colors',
  buttonDanger:
    'px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-lg shadow-sm transition-colors',

  // Voci della Sidebar
  sidebarItem:
    'flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors cursor-pointer mb-1',
  sidebarItemActive: 'bg-blue-600 text-white font-semibold',
  sidebarItemIdle: 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
  sidebarItemHighlight:
    'bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 font-semibold',
};
