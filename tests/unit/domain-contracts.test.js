import { describe, it, expect } from 'vitest';
import {
  HTTP_METHODS,
  SUPPORTED_HTTP_METHODS,
  CELL_STATUS,
  ISSUE_SEVERITY,
  ISSUE_TYPE,
  createRoute,
  createHttpCall,
  createMatrixCell,
  createIssue,
} from '../../src/types/domain-contracts.js';

describe('domain-contracts', () => {
  describe('Enumeradores Centrais', () => {
    it('deve exportar HTTP_METHODS imutavel com todos os verbos REST padrao', () => {
      expect(Object.isFrozen(HTTP_METHODS)).toBe(true);
      expect(HTTP_METHODS).toEqual({
        GET: 'GET',
        POST: 'POST',
        PUT: 'PUT',
        PATCH: 'PATCH',
        DELETE: 'DELETE',
      });
      expect(Object.isFrozen(SUPPORTED_HTTP_METHODS)).toBe(true);
      expect(SUPPORTED_HTTP_METHODS).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    });

    it('deve exportar CELL_STATUS imutavel com todos os estados da matriz', () => {
      expect(Object.isFrozen(CELL_STATUS)).toBe(true);
      expect(CELL_STATUS).toEqual({
        CONNECTED: 'CONNECTED',
        BACKEND_ONLY: 'BACKEND_ONLY',
        FRONTEND_ONLY: 'FRONTEND_ONLY',
        NOT_DECLARED: 'NOT_DECLARED',
        INCONCLUSIVE: 'INCONCLUSIVE',
      });
    });

    it('deve exportar ISSUE_SEVERITY imutavel com as tres categorias de impacto', () => {
      expect(Object.isFrozen(ISSUE_SEVERITY)).toBe(true);
      expect(ISSUE_SEVERITY).toEqual({
        HIGH: 'HIGH',
        MEDIUM: 'MEDIUM',
        LOW: 'LOW',
      });
    });

    it('deve exportar ISSUE_TYPE imutavel com todas as anomalias suportadas', () => {
      expect(Object.isFrozen(ISSUE_TYPE)).toBe(true);
      expect(ISSUE_TYPE).toEqual({
        BROKEN_CALL: 'BROKEN_CALL',
        ORPHAN_ENDPOINT: 'ORPHAN_ENDPOINT',
        METHOD_MISMATCH: 'METHOD_MISMATCH',
        UNORGANIZED_CALLS: 'UNORGANIZED_CALLS',
        NEAR_DUPLICATE: 'NEAR_DUPLICATE',
      });
    });
  });

  describe('createRoute', () => {
    const validParams = {
      method: 'GET',
      canonicalPath: '/api/users',
      filePath: 'server/routes/users.js',
      line: 42,
    };

    it('deve criar uma entidade de rota com defaults adequados e objeto congelado', () => {
      const route = createRoute(validParams);

      expect(Object.isFrozen(route)).toBe(true);
      expect(Object.isFrozen(route.middlewares)).toBe(true);
      expect(route).toEqual({
        id: null,
        auditId: null,
        method: 'GET',
        canonicalPath: '/api/users',
        rawPath: '/api/users',
        filePath: 'server/routes/users.js',
        line: 42,
        column: 0,
        middlewares: [],
        handlerName: null,
      });
    });

    it('deve normalizar metodo com espacos e caracteres minusculos', () => {
      const route = createRoute({
        ...validParams,
        method: '  post  ',
      });
      expect(route.method).toBe('POST');
    });

    it('deve aceitar todas as propriedades opcionais customizadas', () => {
      const route = createRoute({
        ...validParams,
        id: 'route-1',
        auditId: 99,
        rawPath: '/api/users/:id',
        column: 14,
        middlewares: ['authenticateToken', 'checkPermission'],
        handlerName: 'getUserById',
      });

      expect(route.id).toBe('route-1');
      expect(route.auditId).toBe(99);
      expect(route.rawPath).toBe('/api/users/:id');
      expect(route.column).toBe(14);
      expect(route.middlewares).toEqual(['authenticateToken', 'checkPermission']);
      expect(route.handlerName).toBe('getUserById');
    });

    it('deve lancar TypeError se params nao for objeto', () => {
      expect(() => createRoute()).toThrow(TypeError);
      expect(() => createRoute(null)).toThrow(TypeError);
      expect(() => createRoute('invalido')).toThrow(TypeError);
      expect(() => createRoute([])).toThrow(TypeError);
    });

    it('deve lancar TypeError se metodo for ausente ou nao suportado', () => {
      expect(() => createRoute({ ...validParams, method: '' })).toThrow(TypeError);
      expect(() => createRoute({ ...validParams, method: 'OPTIONS' })).toThrow(TypeError);
      expect(() => createRoute({ ...validParams, method: 123 })).toThrow(TypeError);
    });

    it('deve lancar TypeError se campos obrigatorios estiverem vazios ou invalidos', () => {
      expect(() => createRoute({ ...validParams, canonicalPath: '   ' })).toThrow(TypeError);
      expect(() => createRoute({ ...validParams, filePath: null })).toThrow(TypeError);
      expect(() => createRoute({ ...validParams, line: -1 })).toThrow(TypeError);
      expect(() => createRoute({ ...validParams, line: '42' })).toThrow(TypeError);
    });

    it('deve lancar TypeError se middlewares contiver elementos nao-string', () => {
      expect(() =>
        createRoute({
          ...validParams,
          middlewares: ['auth', 123],
        })
      ).toThrow(TypeError);
    });
  });

  describe('createHttpCall', () => {
    const validParams = {
      method: 'POST',
      canonicalPath: '/api/users',
      filePath: 'src/services/userService.js',
      line: 25,
    };

    it('deve criar uma chamada HTTP com defaults adequados e objeto congelado', () => {
      const call = createHttpCall(validParams);

      expect(Object.isFrozen(call)).toBe(true);
      expect(call).toEqual({
        id: null,
        auditId: null,
        method: 'POST',
        canonicalPath: '/api/users',
        rawUrl: '/api/users',
        filePath: 'src/services/userService.js',
        line: 25,
        column: 0,
        callerName: null,
        clientType: 'fetch',
      });
    });

    it('deve suportar axios e parametros customizados', () => {
      const call = createHttpCall({
        ...validParams,
        id: 10,
        auditId: 4,
        rawUrl: '/api/users/${userId}',
        column: 6,
        callerName: 'createUserAccount',
        clientType: 'axios',
      });

      expect(call.id).toBe(10);
      expect(call.auditId).toBe(4);
      expect(call.rawUrl).toBe('/api/users/${userId}');
      expect(call.column).toBe(6);
      expect(call.callerName).toBe('createUserAccount');
      expect(call.clientType).toBe('axios');
    });

    it('deve lancar TypeError se params for invalido ou campos obrigatorios faltarem', () => {
      expect(() => createHttpCall(null)).toThrow(TypeError);
      expect(() => createHttpCall({ ...validParams, method: 'INVALID' })).toThrow(TypeError);
      expect(() => createHttpCall({ ...validParams, canonicalPath: '' })).toThrow(TypeError);
      expect(() => createHttpCall({ ...validParams, filePath: 123 })).toThrow(TypeError);
      expect(() => createHttpCall({ ...validParams, line: -5 })).toThrow(TypeError);
    });
  });

  describe('createMatrixCell', () => {
    const validParams = {
      canonicalPath: '/api/users',
      method: 'GET',
      status: CELL_STATUS.CONNECTED,
    };

    it('deve criar celula matricial com defaults adequados e imutabilidade', () => {
      const cell = createMatrixCell(validParams);

      expect(Object.isFrozen(cell)).toBe(true);
      expect(Object.isFrozen(cell.routes)).toBe(true);
      expect(Object.isFrozen(cell.calls)).toBe(true);
      expect(cell).toEqual({
        id: null,
        auditId: null,
        canonicalPath: '/api/users',
        method: 'GET',
        status: 'CONNECTED',
        consumersCount: 0,
        routes: [],
        calls: [],
      });
    });

    it('deve receber rotas e chamadas associadas e congelar colecoes', () => {
      const route = createRoute({
        method: 'GET',
        canonicalPath: '/api/users',
        filePath: 'server.js',
        line: 10,
      });
      const call = createHttpCall({
        method: 'GET',
        canonicalPath: '/api/users',
        filePath: 'app.jsx',
        line: 15,
      });

      const cell = createMatrixCell({
        ...validParams,
        consumersCount: 1,
        routes: [route],
        calls: [call],
      });

      expect(cell.consumersCount).toBe(1);
      expect(cell.routes).toHaveLength(1);
      expect(cell.calls).toHaveLength(1);
      expect(Object.isFrozen(cell.routes)).toBe(true);
      expect(Object.isFrozen(cell.calls)).toBe(true);
    });

    it('deve lancar TypeError com status invalido ou nao reconhecido', () => {
      expect(() => createMatrixCell({ ...validParams, status: 'INVALID_STATUS' })).toThrow(TypeError);
      expect(() => createMatrixCell({ ...validParams, status: null })).toThrow(TypeError);
    });

    it('deve lancar TypeError se consumersCount for negativo ou routes/calls nao forem arrays', () => {
      expect(() => createMatrixCell({ ...validParams, consumersCount: -2 })).toThrow(TypeError);
      expect(() => createMatrixCell({ ...validParams, routes: 'invalido' })).toThrow(TypeError);
      expect(() => createMatrixCell({ ...validParams, calls: 42 })).toThrow(TypeError);
    });
  });

  describe('createIssue', () => {
    const validParams = {
      severity: ISSUE_SEVERITY.HIGH,
      type: ISSUE_TYPE.BROKEN_CALL,
      canonicalPath: '/api/missing-endpoint',
      message: 'Chamada frontend realizada para rota nao declarada no backend.',
    };

    it('deve criar uma anomalia com defaults adequados e objeto congelado', () => {
      const issue = createIssue(validParams);

      expect(Object.isFrozen(issue)).toBe(true);
      expect(Object.isFrozen(issue.details)).toBe(true);
      expect(issue).toEqual({
        id: null,
        auditId: null,
        severity: 'HIGH',
        type: 'BROKEN_CALL',
        canonicalPath: '/api/missing-endpoint',
        method: null,
        message: 'Chamada frontend realizada para rota nao declarada no backend.',
        filePath: null,
        line: null,
        details: {},
      });
    });

    it('deve suportar campos opcionais de rastreabilidade e contexto', () => {
      const issue = createIssue({
        ...validParams,
        method: 'POST',
        filePath: 'src/pages/Users.jsx',
        line: 88,
        details: { suggestedFix: 'Criar controller para POST /api/missing-endpoint' },
      });

      expect(issue.method).toBe('POST');
      expect(issue.filePath).toBe('src/pages/Users.jsx');
      expect(issue.line).toBe(88);
      expect(issue.details).toEqual({
        suggestedFix: 'Criar controller para POST /api/missing-endpoint',
      });
      expect(Object.isFrozen(issue.details)).toBe(true);
    });

    it('deve lancar TypeError para severidade ou tipo inexistentes', () => {
      expect(() => createIssue({ ...validParams, severity: 'CRITICAL' })).toThrow(TypeError);
      expect(() => createIssue({ ...validParams, type: 'UNKNOWN_BUG' })).toThrow(TypeError);
    });

    it('deve lancar TypeError se campos obrigatorios forem omitidos ou vazios', () => {
      expect(() => createIssue({ ...validParams, canonicalPath: '   ' })).toThrow(TypeError);
      expect(() => createIssue({ ...validParams, message: '' })).toThrow(TypeError);
      expect(() => createIssue(null)).toThrow(TypeError);
    });

    it('deve lancar TypeError se details for invalido ou method for desconhecido', () => {
      expect(() => createIssue({ ...validParams, details: 'invalido' })).toThrow(TypeError);
      expect(() => createIssue({ ...validParams, details: [] })).toThrow(TypeError);
      expect(() => createIssue({ ...validParams, method: 'INVALID' })).toThrow(TypeError);
    });
  });
});
