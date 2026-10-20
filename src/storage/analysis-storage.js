/**
 * Camada de Persistencia Local IndexedDB com Dexie.js
 * rest-api-matrix-analyzer
 *
 * Gerencia o armazenamento persistente no navegador para auditorias de projetos,
 * rotas Express, chamadas HTTP, celulas da matriz REST e anomalias arquiteturais.
 */

import Dexie from 'dexie';

export const DB_NAME = 'RestApiMatrixDB';
export const DB_VERSION = 1;

export const STORES_SCHEMA = Object.freeze({
  audits: '++id, projectName, createdAt, filesCount, routesCount, callsCount',
  routes: '++id, auditId, method, canonicalPath, rawPath, filePath, line',
  calls: '++id, auditId, method, canonicalPath, rawUrl, filePath, line',
  matrix_cells: '++id, auditId, [canonicalPath+method], status, consumersCount',
  issues: '++id, auditId, severity, type, canonicalPath',
});

/**
 * Cria e configura uma instancia do banco Dexie com o schema oficial.
 *
 * @param {string} [dbName=DB_NAME] Nome do banco no IndexedDB
 * @param {Object} [options={}] Opcoes adicionais do Dexie
 * @returns {Dexie} Instancia configurada do Dexie
 */
export function createDatabase(dbName = DB_NAME, options = {}) {
  const database = new Dexie(dbName, options);
  database.version(DB_VERSION).stores(STORES_SCHEMA);
  return database;
}

/**
 * Instancia padrao singleton do banco de dados local da aplicacao.
 */
export const db = createDatabase(DB_NAME);

/**
 * Salva atomicamente o resultado de uma auditoria completa no IndexedDB.
 *
 * @param {Object} auditData Dados consolidados da auditoria
 * @param {Dexie} [databaseInstance=db] Instancia do banco de dados
 * @returns {Promise<number>} Identificador numerico gerado para a auditoria
 */
export async function saveAuditResult(auditData, databaseInstance = db) {
  if (!auditData || typeof auditData !== 'object' || Array.isArray(auditData)) {
    throw new TypeError('saveAuditResult: esperado um objeto contendo os dados da auditoria.');
  }

  const projectName = typeof auditData.projectName === 'string' && auditData.projectName.trim()
    ? auditData.projectName.trim()
    : 'Untitled Project';

  const createdAt = typeof auditData.createdAt === 'string' && auditData.createdAt.trim()
    ? auditData.createdAt.trim()
    : new Date().toISOString();

  const routes = Array.isArray(auditData.routes) ? auditData.routes : [];
  const calls = Array.isArray(auditData.calls) ? auditData.calls : [];

  let matrixCells = [];
  if (Array.isArray(auditData.matrix_cells)) {
    matrixCells = auditData.matrix_cells;
  } else if (Array.isArray(auditData.flatCells)) {
    matrixCells = auditData.flatCells;
  } else if (auditData.matrixResult && Array.isArray(auditData.matrixResult.flatCells)) {
    matrixCells = auditData.matrixResult.flatCells;
  }

  const issues = Array.isArray(auditData.issues) ? auditData.issues : [];

  const filesCount = typeof auditData.filesCount === 'number'
    ? auditData.filesCount
    : (typeof auditData.totalFiles === 'number' ? auditData.totalFiles : 0);

  const routesCount = typeof auditData.routesCount === 'number'
    ? auditData.routesCount
    : routes.length;

  const callsCount = typeof auditData.callsCount === 'number'
    ? auditData.callsCount
    : calls.length;

  const totalDurationMs = typeof auditData.totalDurationMs === 'number'
    ? auditData.totalDurationMs
    : (typeof auditData.summary?.totalDurationMs === 'number' ? auditData.summary.totalDurationMs : 0);

  const summary = auditData.summary && typeof auditData.summary === 'object'
    ? { ...auditData.summary }
    : null;

  return await databaseInstance.transaction(
    'rw',
    [
      databaseInstance.audits,
      databaseInstance.routes,
      databaseInstance.calls,
      databaseInstance.matrix_cells,
      databaseInstance.issues,
    ],
    async () => {
      const auditRecord = {
        projectName,
        createdAt,
        filesCount,
        routesCount,
        callsCount,
        totalDurationMs,
        summary,
      };

      const auditId = await databaseInstance.audits.add(auditRecord);

      const routeRecords = routes.map((r) => {
        const { id, auditId: _discardAuditId, ...rest } = r || {};
        return {
          ...rest,
          auditId,
          method: r?.method || '',
          canonicalPath: r?.canonicalPath || '',
          rawPath: r?.rawPath || r?.canonicalPath || '',
          filePath: r?.filePath || '',
          line: r?.line || 0,
          column: r?.column || 0,
          middlewares: Array.isArray(r?.middlewares) ? [...r.middlewares] : [],
          handlerName: r?.handlerName || null,
        };
      });

      const callRecords = calls.map((c) => {
        const { id, auditId: _discardAuditId, ...rest } = c || {};
        return {
          ...rest,
          auditId,
          method: c?.method || '',
          canonicalPath: c?.canonicalPath || '',
          rawUrl: c?.rawUrl || c?.canonicalPath || '',
          filePath: c?.filePath || '',
          line: c?.line || 0,
          column: c?.column || 0,
          callerName: c?.callerName || null,
          clientType: c?.clientType || 'fetch',
        };
      });

      const cellRecords = matrixCells.map((cell) => {
        const { id, auditId: _discardAuditId, ...rest } = cell || {};
        return {
          ...rest,
          auditId,
          canonicalPath: cell?.canonicalPath || '',
          method: cell?.method || '',
          status: cell?.status || '',
          consumersCount: cell?.consumersCount || 0,
          routes: Array.isArray(cell?.routes) ? [...cell.routes] : [],
          calls: Array.isArray(cell?.calls) ? [...cell.calls] : [],
        };
      });

      const issueRecords = issues.map((iss) => {
        const { id, auditId: _discardAuditId, ...rest } = iss || {};
        return {
          ...rest,
          auditId,
          severity: iss?.severity || '',
          type: iss?.type || '',
          canonicalPath: iss?.canonicalPath || '',
          method: iss?.method || null,
          message: iss?.message || '',
          filePath: iss?.filePath || null,
          line: iss?.line ?? null,
          details: iss?.details ? { ...iss.details } : {},
        };
      });

      if (routeRecords.length > 0) {
        await databaseInstance.routes.bulkAdd(routeRecords);
      }
      if (callRecords.length > 0) {
        await databaseInstance.calls.bulkAdd(callRecords);
      }
      if (cellRecords.length > 0) {
        await databaseInstance.matrix_cells.bulkAdd(cellRecords);
      }
      if (issueRecords.length > 0) {
        await databaseInstance.issues.bulkAdd(issueRecords);
      }

      return auditId;
    }
  );
}

/**
 * Recupera a listagem de auditorias recentes ordenada por data decrescente.
 *
 * @param {number} [limit=10] Quantidade maxima de registros a retornar
 * @param {Dexie} [databaseInstance=db] Instancia do banco de dados
 * @returns {Promise<Array<Object>>} Lista de auditorias ordenadas
 */
export async function getRecentAudits(limit = 10, databaseInstance = db) {
  const parsedLimit = typeof limit === 'number' && Number.isInteger(limit) && limit > 0
    ? limit
    : (limit === null || limit === undefined ? 10 : 0);

  if (parsedLimit === 0) {
    return [];
  }

  return await databaseInstance.audits
    .orderBy('createdAt')
    .reverse()
    .limit(parsedLimit)
    .toArray();
}

/**
 * Carrega uma auditoria completa pelo identificador numerico com todas as entidades associadas.
 *
 * @param {number|string} id Identificador da auditoria
 * @param {Dexie} [databaseInstance=db] Instancia do banco de dados
 * @returns {Promise<Object|null>} Objeto consolidado da auditoria ou null se nao encontrada
 */
export async function getAuditById(id, databaseInstance = db) {
  if (id === undefined || id === null) {
    return null;
  }
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return null;
  }

  const audit = await databaseInstance.audits.get(numericId);
  if (!audit) {
    return null;
  }

  const [routes, calls, matrixCells, issues] = await Promise.all([
    databaseInstance.routes.where('auditId').equals(numericId).toArray(),
    databaseInstance.calls.where('auditId').equals(numericId).toArray(),
    databaseInstance.matrix_cells.where('auditId').equals(numericId).toArray(),
    databaseInstance.issues.where('auditId').equals(numericId).toArray(),
  ]);

  return {
    ...audit,
    routes,
    calls,
    matrix_cells: matrixCells,
    flatCells: matrixCells,
    issues,
  };
}

/**
 * Exclui atomicamente uma auditoria e todos os registros dependentes vinculados.
 *
 * @param {number|string} id Identificador da auditoria a remover
 * @param {Dexie} [databaseInstance=db] Instancia do banco de dados
 * @returns {Promise<boolean>} Verdadeiro se removido com sucesso, falso se nao existir
 */
export async function deleteAudit(id, databaseInstance = db) {
  if (id === undefined || id === null) {
    return false;
  }
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    return false;
  }

  const exists = await databaseInstance.audits.get(numericId);
  if (!exists) {
    return false;
  }

  await databaseInstance.transaction(
    'rw',
    [
      databaseInstance.audits,
      databaseInstance.routes,
      databaseInstance.calls,
      databaseInstance.matrix_cells,
      databaseInstance.issues,
    ],
    async () => {
      await Promise.all([
        databaseInstance.audits.delete(numericId),
        databaseInstance.routes.where('auditId').equals(numericId).delete(),
        databaseInstance.calls.where('auditId').equals(numericId).delete(),
        databaseInstance.matrix_cells.where('auditId').equals(numericId).delete(),
        databaseInstance.issues.where('auditId').equals(numericId).delete(),
      ]);
    }
  );

  return true;
}

/**
 * Limpa atomicamente todas as tabelas do banco de dados local.
 *
 * @param {Dexie} [databaseInstance=db] Instancia do banco de dados
 * @returns {Promise<boolean>} Verdadeiro apos a limpeza completa
 */
export async function clearAllAudits(databaseInstance = db) {
  await databaseInstance.transaction(
    'rw',
    [
      databaseInstance.audits,
      databaseInstance.routes,
      databaseInstance.calls,
      databaseInstance.matrix_cells,
      databaseInstance.issues,
    ],
    async () => {
      await Promise.all([
        databaseInstance.audits.clear(),
        databaseInstance.routes.clear(),
        databaseInstance.calls.clear(),
        databaseInstance.matrix_cells.clear(),
        databaseInstance.issues.clear(),
      ]);
    }
  );
  return true;
}

/**
 * Retorna a contagem total de auditorias cadastradas no banco de dados.
 *
 * @param {Dexie} [databaseInstance=db] Instancia do banco de dados
 * @returns {Promise<number>} Quantidade total de auditorias
 */
export async function countAudits(databaseInstance = db) {
  return await databaseInstance.audits.count();
}
