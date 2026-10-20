import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  Trash2,
  FolderGit2,
  Calendar,
  Layers,
  ArrowRight,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  getRecentAudits,
  deleteAudit,
} from '../../storage/analysis-storage.js';

/**
 * Formata a data ISO para exibicao amigavel no padrao local pt-BR.
 *
 * @param {string} isoString Data em formato ISO
 * @returns {string} Data formatada
 */
function formatAuditDate(isoString) {
  if (!isoString) return 'Data desconhecida';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }
    return date.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Componente que renderiza a lista de auditorias anteriores salvas no IndexedDB local.
 *
 * @param {object} props
 * @param {Function} props.onSelectAudit Callback executado ao selecionar uma auditoria para carregamento
 * @param {number} [props.limit=10] Limite de registros a recuperar
 * @param {any} [props.refreshTrigger] Gatilho para forcar a recarga dos registros
 * @param {string} [props.className] Classes CSS adicionais
 * @param {object} [props.storageService] Servico de persistencia injetavel para testes
 */
export default function AuditHistoryList({
  onSelectAudit,
  limit = 10,
  refreshTrigger = 0,
  className = '',
  storageService = { getRecentAudits, deleteAudit },
}) {
  const [audits, setAudits] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadAudits = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const records = await storageService.getRecentAudits(limit);
      setAudits(Array.isArray(records) ? records : []);
    } catch (err) {
      setErrorMessage(err?.message || 'Falha ao carregar auditorias anteriores.');
    } finally {
      setIsLoading(false);
    }
  }, [limit, storageService]);

  useEffect(() => {
    loadAudits();
  }, [loadAudits, refreshTrigger]);

  const handleDelete = useCallback(
    async (auditId, e) => {
      e?.stopPropagation?.();
      setDeletingId(auditId);
      try {
        await storageService.deleteAudit(auditId);
        setAudits((prev) => prev.filter((item) => item.id !== auditId));
      } catch (err) {
        setErrorMessage(err?.message || 'Falha ao remover a auditoria selecionada.');
      } finally {
        setDeletingId(null);
      }
    },
    [storageService]
  );

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur p-6 flex flex-col gap-4 ${className}`}
      data-testid="audit-history-list"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <History className="w-5 h-5 text-blue-400" />
          <h2 className="text-base font-semibold text-white tracking-tight">
            Auditorias Locais Salvas
          </h2>
        </div>
        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
          {audits.length} {audits.length === 1 ? 'registro' : 'registros'}
        </span>
      </div>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <span className="text-xs">Consultando banco de dados IndexedDB...</span>
        </div>
      ) : audits.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center gap-2 text-slate-500">
          <FolderGit2 className="w-8 h-8 text-slate-600" />
          <p className="text-xs font-medium text-slate-400">
            Nenhuma auditoria registrada no armazenamento local.
          </p>
          <p className="text-xs text-slate-500 max-w-sm">
            Ao importar e auditar um projeto, os resultados serao salvos automaticamente nesta sessao.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5 overflow-y-auto max-h-[380px] pr-1">
          {audits.map((audit) => {
            const isDeleting = deletingId === audit.id;

            return (
              <li
                key={audit.id}
                className="group rounded-xl border border-slate-800/80 bg-slate-950/50 hover:bg-slate-950/80 p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                data-testid={`audit-item-${audit.id}`}
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-200 truncate">
                      {audit.projectName || 'Projeto Sem Nome'}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-500" />
                      {formatAuditDate(audit.createdAt)}
                    </span>
                    <span className="text-slate-600">&bull;</span>
                    <span className="inline-flex items-center gap-1">
                      <Layers className="w-3.5 h-3.5 text-slate-500" />
                      {audit.filesCount ?? 0} arquivos
                    </span>
                    <span className="text-slate-600">&bull;</span>
                    <span className="text-emerald-400/90 font-mono">
                      {audit.routesCount ?? 0} rotas
                    </span>
                    <span className="text-slate-600">&bull;</span>
                    <span className="text-blue-400/90 font-mono">
                      {audit.callsCount ?? 0} chamadas
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectAudit?.(audit)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                    aria-label={`Abrir auditoria do projeto ${audit.projectName}`}
                  >
                    <span>Carregar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={(e) => handleDelete(audit.id, e)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 cursor-pointer"
                    title="Excluir auditoria"
                    aria-label={`Excluir auditoria ${audit.projectName}`}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
