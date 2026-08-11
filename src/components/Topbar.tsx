'use client';

import React from 'react';

// 1. Aggiungiamo onToggleSidebar all'interfaccia
interface TopbarProps {
  onMobileMenuOpen?: () => void;
  onToggleSidebar?: () => void; // Aggiunto
  sidebarCollapsed?: boolean;
}

// 2. Aggiorniamo la destrutturazione nella funzione
export default function Topbar({
  onMobileMenuOpen,
  onToggleSidebar,
  sidebarCollapsed,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-white px-4 sm:h-16 sm:px-6">
      {/* Esempio di utilizzo del bottone toggle */}
      <button onClick={onToggleSidebar} className="hidden md:flex p-2 text-slate-500">
        Toggle Sidebar
      </button>

      <button onClick={onMobileMenuOpen} className="md:hidden p-2 text-slate-500">
        Menu
      </button>

      <div className="flex-1"></div>
    </header>
  );
}
