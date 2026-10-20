import React, { useState, useCallback } from 'react';
import {
  Layers,
  ShieldCheck,
  Cpu,
  Lock,
  GitGraph,
  SearchCode,
  FileCheck2,
  AlertTriangle,
} from 'lucide-react';
import ProjectImportCard from '../components/project-import/ProjectImportCard.jsx';
import AuditHistoryList from '../components/project-import/AuditHistoryList.jsx';
import { useProjectAnalysis } from '../hooks/useProjectAnalysis.js';
import {
  saveAuditResult,
  getAuditById,
} from '../storage/analysis-storage.js';

const PILLARS = [
  {
    icon: Lock,
    title: 'Local-First e Zero-Cloud',
    description:
      'O codigo nunca sai da sua maquina. Leitura nativa em streaming via File System Access API ou pacote .zip sem envio para a nuvem.',
    tag: 'Privacidade Total',
    color: 'emerald',
  },
  {
    icon: Cpu,
    title: 'AST Real com Babel',
    description:
      'Extracao sintatica estatica com @babel/parser e @babel/traverse, mapeando rotas Express e chamadas Axios/Fetch com precisao de linha e coluna.',
    tag: 'Sem Regex Fragil',
    color: 'blue',
  },
  {
    icon: GitGraph,
    title: 'Matriz Visual de Cobertura',
    description:
      'Cruzamento bidimensional de Recursos x Verbos HTTP com identificacao de rotas conectadas, orfas e chamadas sem backend.',
    tag: 'Grade Relacional',
    color: 'purple',
  },
  {
    icon: SearchCode,
    title: 'Auditoria de Anomalias',
    description:
      'Deteccao deterministica de anomalias com classificacao por severidade (erros 404 em potencial, desencontro de verbos e quase-duplicatas).',
    tag: 'Governanca REST',
    color: 'amber',
  },
];

/**
 * Pagina inicial de onboarding e acolhimento para importacao de projetos e consulta de historico.
 *
 * @param {object} props
 * @param {Function} [props.onAnalysisComplete] Callback invocado ao concluir e persistir uma nova auditoria
 * @param {Function} [props.onLoadAudit] Callback invocado ao carregar uma auditoria anterior salva
 * @param {object} [props.analysisHook] Instancia customizada do hook para injecao em testes
 * @param {object} [props.storageService] Instancia customizada de servicos de storage para injecao em testes
 */
export default function HomePage({
  onAnalysisComplete,
  onLoadAudit,
  analysisHook,
  storageService = { saveAuditResult, getAuditById },
}) {
  const [currentProjectName, setCurrentProjectName] = useState('Projeto');
  const [refreshHistoryTrigger, setRefreshHistoryTrigger] = useState(0);

  const defaultHook = useProjectAnalysis({
    onComplete: async (result) => {
      try {
        const payloadToSave = {
          projectName: currentProjectName,
          createdAt: new Date().toISOString(),
          filesCount: result?.summary?.totalFiles ?? 0,
          routesCount: result?.routes?.length ?? 0,
          callsCount: result?.calls?.length ?? 0,
          routes: result?.routes ?? [],
          calls: result?.calls ?? [],
          matrix_cells: result?.matrixResult?.flatCells ?? [],
          issues: result?.issues ?? [],
          summary: result?.summary ?? null,
        };

        const auditId = await storageService.saveAuditResult(payloadToSave);
        setRefreshHistoryTrigger((prev) => prev + 1);

        if (typeof onAnalysisComplete === 'function') {
          onAnalysisComplete({ id: auditId, ...payloadToSave });
        }
      } catch (saveError) {
        // Se a persistencia falhar, ainda entrega o resultado para a visualizacao
        if (typeof onAnalysisComplete === 'function') {
          onAnalysisComplete(result);
        }
      }
    },
  });

  const activeHook = analysisHook || defaultHook;

  const handleFilesSelected = useCallback(
    (files, projectName) => {
      const name = projectName || 'Projeto Local';
      setCurrentProjectName(name);
      activeHook.startAnalysis(files, name);
    },
    [activeHook]
  );

  const handleSelectHistoricalAudit = useCallback(
    async (auditSummary) => {
      if (!auditSummary?.id) return;
      try {
        const fullAudit = await storageService.getAuditById(auditSummary.id);
        if (typeof onLoadAudit === 'function') {
          onLoadAudit(fullAudit || auditSummary);
        }
      } catch {
        if (typeof onLoadAudit === 'function') {
          onLoadAudit(auditSummary);
        }
      }
    },
    [onLoadAudit, storageService]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" data-testid="home-page">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
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
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Zero-Cloud
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-8">
        <section className="flex flex-col gap-3 py-4 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center gap-2 self-center px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
            <FileCheck2 className="w-3.5 h-3.5" />
            <span>Auditoria Arquitetural Sem Custos de Servidor</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Mapeie a comunicacao entre Frontend e Backend em segundos
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Inspecione o codigo-fonte de aplicacoes Express e React, identifique rotas orfas, chamadas quebradas e discrepancias de verbos HTTP sem que qualquer linha de codigo saia do seu navegador.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {PILLARS.map((pillar) => {
            const IconComponent = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
                    <IconComponent className="w-4 h-4 text-slate-200" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-2 py-0.5 rounded bg-slate-800/60 border border-slate-700/60">
                    {pillar.tag}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="text-sm font-semibold text-slate-200">
                    {pillar.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {pillar.description}
                  </p>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <ProjectImportCard
              onFilesSelected={handleFilesSelected}
              isAnalyzing={activeHook.isAnalyzing}
              progress={activeHook.progress}
              onCancel={activeHook.cancelAnalysis}
              error={activeHook.error}
            />
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <AuditHistoryList
              onSelectAudit={handleSelectHistoricalAudit}
              refreshTrigger={refreshHistoryTrigger}
              storageService={storageService}
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950 px-6 py-4 text-center text-xs text-slate-600 flex flex-col sm:flex-row items-center justify-between max-w-7xl w-full mx-auto gap-2">
        <span>rest-api-matrix-analyzer &bull; Analise estatica deterministica e local-first</span>
        <span className="font-mono text-slate-500">React 18 &bull; Vite &bull; Tailwind CSS &bull; Dexie.js</span>
      </footer>
    </div>
  );
}
