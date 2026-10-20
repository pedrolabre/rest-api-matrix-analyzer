import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  db,
  createDatabase,
  saveAuditResult,
  getRecentAudits,
  getAuditById,
  deleteAudit,
  clearAllAudits,
  countAudits,
  DB_NAME,
  DB_VERSION,
  STORES_SCHEMA,
} from '../../src/storage/analysis-storage.js';
import {
  createRoute,
  createHttpCall,
  createMatrixCell,
  createIssue,
  CELL_STATUS,
  ISSUE_SEVERITY,
  ISSUE_TYPE,
} from '../../src/types/domain-contracts.js';

describe('analysis-storage (Dexie.js / IndexedDB)', () => {
  beforeEach(async () => {
    await clearAllAudits(db);
  });

  afterEach(async () => {
    await clearAllAudits(db);
  });

  describe('constantes e schema', () => {
    it('deve exportar DB_NAME como RestApiMatrixDB', () => {
      expect(DB_NAME).toBe('RestApiMatrixDB');
    });

    it('deve exportar DB_VERSION como 1', () => {
      expect(DB_VERSION).toBe(1);
    });

    it('deve definir STORES_SCHEMA com as 5 tabelas especificadas', () => {
      expect(STORES_SCHEMA).toEqual({
        audits: '++id, projectName, createdAt, filesCount, routesCount, callsCount',
        routes: '++id, auditId, method, canonicalPath, rawPath, filePath, line',
        calls: '++id, auditId, method, canonicalPath, rawUrl, filePath, line',
        matrix_cells: '++id, auditId, [canonicalPath+method], status, consumersCount',
        issues: '++id, auditId, severity, type, canonicalPath',
      });
      expect(Object.isFrozen(STORES_SCHEMA)).toBe(true);
    });

    it('deve instanciar db padrao com as tabelas esperadas', () => {
      expect(db.name).toBe('RestApiMatrixDB');
      expect(db.tables.map((t) => t.name).sort()).toEqual([
        'audits',
        'calls',
        'issues',
        'matrix_cells',
        'routes',
      ]);
    });

    it('deve permitir criar bancos isolados com createDatabase', async () => {
      const customDb = createDatabase('CustomIsolatedDB');
      expect(customDb.name).toBe('CustomIsolatedDB');
      expect(customDb.tables.map((t) => t.name).sort()).toEqual([
        'audits',
        'calls',
        'issues',
        'matrix_cells',
        'routes',
      ]);
      await customDb.delete();
    });
  });

  describe('saveAuditResult', () => {
    it('deve rejeitar payloads invalidos com TypeError', async () => {
      await expect(saveAuditResult(null)).rejects.toThrow(TypeError);
      await expect(saveAuditResult(undefined)).rejects.toThrow(TypeError);
      await expect(saveAuditResult('invalid')).rejects.toThrow(TypeError);
      await expect(saveAuditResult([1, 2, 3])).rejects.toThrow(TypeError);
    });

    it('deve salvar uma auditoria minima com valores padrao', async () => {
      const auditId = await saveAuditResult({});
      expect(typeof auditId).toBe('number');
      expect(auditId).toBeGreaterThan(0);

      const saved = await db.audits.get(auditId);
      expect(saved).toBeDefined();
      expect(saved.projectName).toBe('Untitled Project');
      expect(saved.filesCount).toBe(0);
      expect(saved.routesCount).toBe(0);
      expect(saved.callsCount).toBe(0);
      expect(typeof saved.createdAt).toBe('string');
    });

    it('deve salvar auditoria completa com rotas, chamadas, celulas e issues', async () => {
      const route = createRoute({
        method: 'GET',
        canonicalPath: '/api/users',
        rawPath: '/api/users',
        filePath: 'src/routes/users.js',
        line: 12,
        column: 4,
        middlewares: ['auth'],
        handlerName: 'getUsers',
      });

      const call = createHttpCall({
        method: 'GET',
        canonicalPath: '/api/users',
        rawUrl: '/api/users',
        filePath: 'src/components/UserList.jsx',
        line: 45,
        column: 6,
        callerName: 'UserList',
        clientType: 'fetch',
      });

      const cell = createMatrixCell({
        canonicalPath: '/api/users',
        method: 'GET',
        status: CELL_STATUS.CONNECTED,
        consumersCount: 1,
        routes: [route],
        calls: [call],
      });

      const issue = createIssue({
        severity: ISSUE_SEVERITY.HIGH,
        type: ISSUE_TYPE.BROKEN_CALL,
        canonicalPath: '/api/legacy',
        method: 'DELETE',
        message: 'Chamada para rota nao declarada no backend',
        filePath: 'src/pages/OldPage.jsx',
        line: 88,
        details: { hint: 'Remover chamada legada' },
      });

      const auditData = {
        projectName: 'ecommerce-platform',
        createdAt: '2026-11-04T20:00:00.000Z',
        filesCount: 42,
        totalDurationMs: 350,
        routes: [route],
        calls: [call],
        matrix_cells: [cell],
        issues: [issue],
        summary: { coveragePercentage: 85.5 },
      };

      const auditId = await saveAuditResult(auditData);
      expect(typeof auditId).toBe('number');
      expect(auditId).toBeGreaterThan(0);

      const auditRecord = await db.audits.get(auditId);
      expect(auditRecord.projectName).toBe('ecommerce-platform');
      expect(auditRecord.createdAt).toBe('2026-11-04T20:00:00.000Z');
      expect(auditRecord.filesCount).toBe(42);
      expect(auditRecord.routesCount).toBe(1);
      expect(auditRecord.callsCount).toBe(1);
      expect(auditRecord.totalDurationMs).toBe(350);
      expect(auditRecord.summary).toEqual({ coveragePercentage: 85.5 });

      const storedRoutes = await db.routes.where('auditId').equals(auditId).toArray();
      expect(storedRoutes).toHaveLength(1);
      expect(storedRoutes[0].auditId).toBe(auditId);
      expect(storedRoutes[0].canonicalPath).toBe('/api/users');
      expect(storedRoutes[0].handlerName).toBe('getUsers');

      const storedCalls = await db.calls.where('auditId').equals(auditId).toArray();
      expect(storedCalls).toHaveLength(1);
      expect(storedCalls[0].auditId).toBe(auditId);
      expect(storedCalls[0].canonicalPath).toBe('/api/users');
      expect(storedCalls[0].callerName).toBe('UserList');

      const storedCells = await db.matrix_cells.where('auditId').equals(auditId).toArray();
      expect(storedCells).toHaveLength(1);
      expect(storedCells[0].auditId).toBe(auditId);
      expect(storedCells[0].canonicalPath).toBe('/api/users');
      expect(storedCells[0].method).toBe('GET');
      expect(storedCells[0].status).toBe(CELL_STATUS.CONNECTED);
      expect(storedCells[0].consumersCount).toBe(1);

      const storedIssues = await db.issues.where('auditId').equals(auditId).toArray();
      expect(storedIssues).toHaveLength(1);
      expect(storedIssues[0].auditId).toBe(auditId);
      expect(storedIssues[0].severity).toBe(ISSUE_SEVERITY.HIGH);
      expect(storedIssues[0].type).toBe(ISSUE_TYPE.BROKEN_CALL);
      expect(storedIssues[0].canonicalPath).toBe('/api/legacy');
    });

    it('deve aceitar flatCells ou matrixResult.flatCells no payload', async () => {
      const cell1 = createMatrixCell({
        canonicalPath: '/api/v1',
        method: 'GET',
        status: CELL_STATUS.BACKEND_ONLY,
      });

      const auditId1 = await saveAuditResult({
        projectName: 'P1',
        flatCells: [cell1],
      });
      const cells1 = await db.matrix_cells.where('auditId').equals(auditId1).toArray();
      expect(cells1).toHaveLength(1);

      const cell2 = createMatrixCell({
        canonicalPath: '/api/v2',
        method: 'POST',
        status: CELL_STATUS.FRONTEND_ONLY,
      });

      const auditId2 = await saveAuditResult({
        projectName: 'P2',
        matrixResult: { flatCells: [cell2] },
      });
      const cells2 = await db.matrix_cells.where('auditId').equals(auditId2).toArray();
      expect(cells2).toHaveLength(1);
    });

    it('deve consultar indices compostos de matrix_cells e indices de routes e calls', async () => {
      const route = createRoute({
        method: 'POST',
        canonicalPath: '/api/checkout',
        filePath: 'checkout.js',
        line: 10,
      });
      const call = createHttpCall({
        method: 'POST',
        canonicalPath: '/api/checkout',
        filePath: 'checkout.jsx',
        line: 20,
      });
      const cell = createMatrixCell({
        canonicalPath: '/api/checkout',
        method: 'POST',
        status: CELL_STATUS.CONNECTED,
      });
      const issue = createIssue({
        severity: ISSUE_SEVERITY.MEDIUM,
        type: ISSUE_TYPE.ORPHAN_ENDPOINT,
        canonicalPath: '/api/unused',
        message: 'Endpoint sem consumidor',
      });

      const auditId = await saveAuditResult({
        projectName: 'IndexTest',
        routes: [route],
        calls: [call],
        matrix_cells: [cell],
        issues: [issue],
      });

      // Indice composto em matrix_cells: [canonicalPath+method]
      const foundCells = await db.matrix_cells
        .where('[canonicalPath+method]')
        .equals(['/api/checkout', 'POST'])
        .toArray();
      expect(foundCells).toHaveLength(1);
      expect(foundCells[0].auditId).toBe(auditId);

      // Indice em routes: method
      const foundRoutes = await db.routes.where('method').equals('POST').toArray();
      expect(foundRoutes).toHaveLength(1);

      // Indice em calls: canonicalPath
      const foundCalls = await db.calls.where('canonicalPath').equals('/api/checkout').toArray();
      expect(foundCalls).toHaveLength(1);

      // Indice em issues: severity
      const foundIssues = await db.issues.where('severity').equals(ISSUE_SEVERITY.MEDIUM).toArray();
      expect(foundIssues).toHaveLength(1);
    });

    it('deve extrair totalDurationMs a partir de summary quando nao fornecido diretamente', async () => {
      const auditId = await saveAuditResult({
        projectName: 'DurationTest',
        summary: { totalDurationMs: 420 },
      });
      const audit = await db.audits.get(auditId);
      expect(audit.totalDurationMs).toBe(420);
    });
  });

  describe('getRecentAudits', () => {
    it('deve retornar lista vazia quando nao houver auditorias', async () => {
      const audits = await getRecentAudits();
      expect(audits).toEqual([]);
    });

    it('deve retornar auditorias ordenadas por createdAt de forma decrescente', async () => {
      await saveAuditResult({
        projectName: 'Projeto A',
        createdAt: '2026-10-01T10:00:00.000Z',
      });
      await saveAuditResult({
        projectName: 'Projeto B',
        createdAt: '2026-10-03T10:00:00.000Z',
      });
      await saveAuditResult({
        projectName: 'Projeto C',
        createdAt: '2026-10-02T10:00:00.000Z',
      });

      const audits = await getRecentAudits(10);
      expect(audits).toHaveLength(3);
      expect(audits.map((a) => a.projectName)).toEqual([
        'Projeto B',
        'Projeto C',
        'Projeto A',
      ]);
    });

    it('deve respeitar o limite maximo informado', async () => {
      for (let i = 1; i <= 5; i++) {
        await saveAuditResult({
          projectName: `Projeto ${i}`,
          createdAt: `2026-10-0${i}T10:00:00.000Z`,
        });
      }

      const top2 = await getRecentAudits(2);
      expect(top2).toHaveLength(2);
      expect(top2[0].projectName).toBe('Projeto 5');
      expect(top2[1].projectName).toBe('Projeto 4');
    });

    it('deve utilizar 10 como limite padrao quando nenhum parametro for passado', async () => {
      for (let i = 1; i <= 15; i++) {
        const padded = String(i).padStart(2, '0');
        await saveAuditResult({
          projectName: `Projeto ${i}`,
          createdAt: `2026-10-${padded}T10:00:00.000Z`,
        });
      }

      const defaultList = await getRecentAudits();
      expect(defaultList).toHaveLength(10);
      expect(defaultList[0].projectName).toBe('Projeto 15');
    });

    it('deve retornar array vazio para limit 0 ou negativo', async () => {
      await saveAuditResult({ projectName: 'P1' });
      expect(await getRecentAudits(0)).toEqual([]);
      expect(await getRecentAudits(-5)).toEqual([]);
    });
  });

  describe('getAuditById', () => {
    it('deve retornar null para id invalido ou nao fornecido', async () => {
      expect(await getAuditById(null)).toBeNull();
      expect(await getAuditById(undefined)).toBeNull();
      expect(await getAuditById('abc')).toBeNull();
      expect(await getAuditById(0)).toBeNull();
      expect(await getAuditById(-1)).toBeNull();
    });

    it('deve retornar null para auditoria inexistente', async () => {
      const result = await getAuditById(999);
      expect(result).toBeNull();
    });

    it('deve retornar auditoria completa hidratada com entidades associadas', async () => {
      const route = createRoute({
        method: 'POST',
        canonicalPath: '/api/auth/login',
        filePath: 'src/routes/auth.js',
        line: 10,
      });
      const call = createHttpCall({
        method: 'POST',
        canonicalPath: '/api/auth/login',
        filePath: 'src/services/auth.js',
        line: 25,
      });
      const cell = createMatrixCell({
        canonicalPath: '/api/auth/login',
        method: 'POST',
        status: CELL_STATUS.CONNECTED,
        consumersCount: 1,
      });
      const issue = createIssue({
        severity: ISSUE_SEVERITY.MEDIUM,
        type: ISSUE_TYPE.NEAR_DUPLICATE,
        canonicalPath: '/api/auth/login',
        message: 'Possivel duplicata',
      });

      const auditId = await saveAuditResult({
        projectName: 'auth-service',
        routes: [route],
        calls: [call],
        matrix_cells: [cell],
        issues: [issue],
      });

      const loaded = await getAuditById(auditId);
      expect(loaded).toBeDefined();
      expect(loaded.id).toBe(auditId);
      expect(loaded.projectName).toBe('auth-service');
      expect(loaded.routes).toHaveLength(1);
      expect(loaded.routes[0].canonicalPath).toBe('/api/auth/login');
      expect(loaded.calls).toHaveLength(1);
      expect(loaded.calls[0].canonicalPath).toBe('/api/auth/login');
      expect(loaded.matrix_cells).toHaveLength(1);
      expect(loaded.flatCells).toHaveLength(1);
      expect(loaded.issues).toHaveLength(1);
      expect(loaded.issues[0].severity).toBe(ISSUE_SEVERITY.MEDIUM);
    });

    it('deve aceitar id como string numerica', async () => {
      const auditId = await saveAuditResult({ projectName: 'numeric-id' });
      const loaded = await getAuditById(String(auditId));
      expect(loaded).toBeDefined();
      expect(loaded.projectName).toBe('numeric-id');
    });
  });

  describe('deleteAudit', () => {
    it('deve retornar false para id invalido ou nao fornecido', async () => {
      expect(await deleteAudit(null)).toBe(false);
      expect(await deleteAudit(undefined)).toBe(false);
      expect(await deleteAudit('invalid')).toBe(false);
      expect(await deleteAudit(0)).toBe(false);
      expect(await deleteAudit(-3)).toBe(false);
    });

    it('deve retornar false quando a auditoria nao existir', async () => {
      const deleted = await deleteAudit(999);
      expect(deleted).toBe(false);
    });

    it('deve excluir atomicamente a auditoria e todos os registros filhos', async () => {
      const route = createRoute({
        method: 'GET',
        canonicalPath: '/api/items',
        filePath: 'items.js',
        line: 1,
      });
      const call = createHttpCall({
        method: 'GET',
        canonicalPath: '/api/items',
        filePath: 'items.jsx',
        line: 1,
      });
      const cell = createMatrixCell({
        canonicalPath: '/api/items',
        method: 'GET',
        status: CELL_STATUS.CONNECTED,
      });
      const issue = createIssue({
        severity: ISSUE_SEVERITY.LOW,
        type: ISSUE_TYPE.UNORGANIZED_CALLS,
        canonicalPath: '/api/items',
        message: 'Chamada solta',
      });

      const auditId = await saveAuditResult({
        projectName: 'to-delete',
        routes: [route],
        calls: [call],
        matrix_cells: [cell],
        issues: [issue],
      });

      expect(await countAudits()).toBe(1);
      expect(await db.routes.count()).toBe(1);
      expect(await db.calls.count()).toBe(1);
      expect(await db.matrix_cells.count()).toBe(1);
      expect(await db.issues.count()).toBe(1);

      const success = await deleteAudit(auditId);
      expect(success).toBe(true);

      expect(await countAudits()).toBe(0);
      expect(await db.routes.count()).toBe(0);
      expect(await db.calls.count()).toBe(0);
      expect(await db.matrix_cells.count()).toBe(0);
      expect(await db.issues.count()).toBe(0);
    });

    it('nao deve remover registros de outras auditorias ao excluir uma especifica', async () => {
      const auditId1 = await saveAuditResult({
        projectName: 'audit-1',
        routes: [
          createRoute({ method: 'GET', canonicalPath: '/a1', filePath: 'a1.js', line: 1 }),
        ],
      });
      const auditId2 = await saveAuditResult({
        projectName: 'audit-2',
        routes: [
          createRoute({ method: 'GET', canonicalPath: '/a2', filePath: 'a2.js', line: 2 }),
        ],
      });

      expect(await countAudits()).toBe(2);
      expect(await db.routes.count()).toBe(2);

      await deleteAudit(auditId1);

      expect(await countAudits()).toBe(1);
      expect(await db.routes.count()).toBe(1);

      const remainingAudit = await getAuditById(auditId2);
      expect(remainingAudit).toBeDefined();
      expect(remainingAudit.routes).toHaveLength(1);
      expect(remainingAudit.routes[0].canonicalPath).toBe('/a2');
    });
  });

  describe('clearAllAudits e countAudits', () => {
    it('deve limpar todas as tabelas completamente', async () => {
      await saveAuditResult({
        projectName: 'A1',
        routes: [createRoute({ method: 'GET', canonicalPath: '/1', filePath: '1.js', line: 1 })],
        calls: [createHttpCall({ method: 'GET', canonicalPath: '/1', filePath: '1.jsx', line: 1 })],
        matrix_cells: [createMatrixCell({ canonicalPath: '/1', method: 'GET', status: CELL_STATUS.CONNECTED })],
        issues: [createIssue({ severity: ISSUE_SEVERITY.LOW, type: ISSUE_TYPE.UNORGANIZED_CALLS, canonicalPath: '/1', message: 'm' })],
      });

      await saveAuditResult({
        projectName: 'A2',
        routes: [createRoute({ method: 'POST', canonicalPath: '/2', filePath: '2.js', line: 1 })],
      });

      expect(await countAudits()).toBe(2);
      expect(await db.routes.count()).toBe(2);

      const result = await clearAllAudits();
      expect(result).toBe(true);

      expect(await countAudits()).toBe(0);
      expect(await db.routes.count()).toBe(0);
      expect(await db.calls.count()).toBe(0);
      expect(await db.matrix_cells.count()).toBe(0);
      expect(await db.issues.count()).toBe(0);
    });

    it('deve funcionar em banco vazio', async () => {
      expect(await countAudits()).toBe(0);
      const result = await clearAllAudits();
      expect(result).toBe(true);
      expect(await countAudits()).toBe(0);
    });
  });
});
