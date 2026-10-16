import React from 'react';
import { ShieldCheck, Cpu, Layers, Database } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white font-mono">
                rest-api-matrix-analyzer
              </h1>
              <p className="text-xs text-slate-400">
                Auditoria e Matriz de Cobertura REST Local-First
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Processamento 100% Client-Side
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300">
              <Cpu className="w-3.5 h-3.5 text-blue-400" />
              AST via Babel
            </span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300">
              <Database className="w-3.5 h-3.5 text-amber-400" />
              Zero-Cloud
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        <section className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center flex flex-col items-center justify-center gap-4 my-auto">
          <div className="p-3 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400">
            <Layers className="w-8 h-8 text-slate-300" />
          </div>
          <div className="max-w-md">
            <h2 className="text-base font-semibold text-white mb-1">
              Ambiente Inicializado com Sucesso
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              O nucleo do aplicativo esta configurado com React 18, Vite e Tailwind CSS. Os modulos de ingestao de arquivos e analise sintatica estarao disponiveis nas proximas etapas.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono text-slate-500 pt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              React SPA
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Tailwind Dark OLED
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              Vitest Ready
            </span>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-3 text-center text-xs text-slate-600">
        rest-api-matrix-analyzer &bull; Analise estatica local-first
      </footer>
    </div>
  );
}
