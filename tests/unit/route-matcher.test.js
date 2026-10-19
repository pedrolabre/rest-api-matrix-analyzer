import { describe, it, expect } from 'vitest';
import {
  matchRoutesAndCalls,
  determineCellStatus,
  findCell,
  filterCellsByStatus,
  getRouteRef,
  getCallRefs,
  calculateMatrixSummary,
} from '../../src/analyzers/route-matcher.js';
import {
  HTTP_METHODS,
  SUPPORTED_HTTP_METHODS,
  CELL_STATUS,
  createRoute,
  createHttpCall,
} from '../../src/types/domain-contracts.js';

describe('route-matcher', () => {
  describe('determineCellStatus', () => {
    it('deve retornar CONNECTED quando backend e frontend estao presentes', () => {
      expect(determineCellStatus(true, true)).toBe(CELL_STATUS.CONNECTED);
    });

    it('deve retornar BACKEND_ONLY quando rota existe mas nao ha chamador', () => {
      expect(determineCellStatus(true, false)).toBe(CELL_STATUS.BACKEND_ONLY);
    });

    it('deve retornar FRONTEND_ONLY quando chamada existe sem rota correspondente', () => {
      expect(determineCellStatus(false, true)).toBe(CELL_STATUS.FRONTEND_ONLY);
    });

    it('deve retornar NOT_DECLARED quando nem backend nem frontend definem a operacao', () => {
      expect(determineCellStatus(false, false)).toBe(CELL_STATUS.NOT_DECLARED);
    });
  });

  describe('getRouteRef e getCallRefs', () => {
    it('deve extrair a rota principal ou null com seguranca', () => {
      const mockRoute = createRoute({
        method: 'GET',
        canonicalPath: '/api/users',
        filePath: 'server/routes/users.js',
        line: 10,
      });

      expect(getRouteRef({ routes: [mockRoute] })).toBe(mockRoute);
      expect(getRouteRef({ routes: [] })).toBeNull();
      expect(getRouteRef(null)).toBeNull();
      expect(getRouteRef({})).toBeNull();
    });

    it('deve extrair a lista de chamadas HTTP ou array vazio', () => {
      const mockCall = createHttpCall({
        method: 'GET',
        canonicalPath: '/api/users',
        filePath: 'src/services/api.js',
        line: 20,
      });

      expect(getCallRefs({ calls: [mockCall] })).toEqual([mockCall]);
      expect(getCallRefs({ calls: [] })).toEqual([]);
      expect(getCallRefs(null)).toEqual([]);
      expect(getCallRefs({})).toEqual([]);
    });
  });

  describe('findCell', () => {
    const route = createRoute({
      method: 'GET',
      canonicalPath: '/api/users',
      filePath: 'server.js',
      line: 1,
    });
    const result = matchRoutesAndCalls([route], []);

    it('deve localizar celula existente com caminho e metodo exatos', () => {
      const cell = findCell(result.matrix, '/api/users', 'GET');
      expect(cell).toBeDefined();
      expect(cell.canonicalPath).toBe('/api/users');
      expect(cell.method).toBe('GET');
      expect(cell.status).toBe(CELL_STATUS.BACKEND_ONLY);
    });

    it('deve normalizar caminho e metodo para busca robusta', () => {
      const cell = findCell(result.matrix, '/api/users/', 'get');
      expect(cell).toBeDefined();
      expect(cell.canonicalPath).toBe('/api/users');
      expect(cell.method).toBe('GET');
    });

    it('deve retornar null se caminho ou metodo nao existirem na matriz', () => {
      expect(findCell(result.matrix, '/api/inexistente', 'GET')).toBeNull();
      expect(findCell(result.matrix, '/api/users', 'OPTIONS')).toBeNull();
      expect(findCell(null, '/api/users', 'GET')).toBeNull();
      expect(findCell(result.matrix, null, 'GET')).toBeNull();
    });
  });

  describe('filterCellsByStatus', () => {
    const routeGet = createRoute({
      method: 'GET',
      canonicalPath: '/api/users',
      filePath: 'server.js',
      line: 1,
    });
    const callGet = createHttpCall({
      method: 'GET',
      canonicalPath: '/api/users',
      filePath: 'client.js',
      line: 5,
    });
    const routePost = createRoute({
      method: 'POST',
      canonicalPath: '/api/users',
      filePath: 'server.js',
      line: 10,
    });
    const callDelete = createHttpCall({
      method: 'DELETE',
      canonicalPath: '/api/users',
      filePath: 'client.js',
      line: 15,
    });

    const result = matchRoutesAndCalls([routeGet, routePost], [callGet, callDelete]);

    it('deve filtrar celulas CONNECTED corretamente', () => {
      const connected = filterCellsByStatus(result, CELL_STATUS.CONNECTED);
      expect(connected).toHaveLength(1);
      expect(connected[0].method).toBe('GET');
    });

    it('deve filtrar celulas BACKEND_ONLY corretamente', () => {
      const backendOnly = filterCellsByStatus(result.matrix, CELL_STATUS.BACKEND_ONLY);
      expect(backendOnly).toHaveLength(1);
      expect(backendOnly[0].method).toBe('POST');
    });

    it('deve filtrar celulas FRONTEND_ONLY corretamente', () => {
      const frontendOnly = filterCellsByStatus(result.flatCells, CELL_STATUS.FRONTEND_ONLY);
      expect(frontendOnly).toHaveLength(1);
      expect(frontendOnly[0].method).toBe('DELETE');
    });

    it('deve filtrar celulas NOT_DECLARED corretamente', () => {
      const notDeclared = filterCellsByStatus(result, CELL_STATUS.NOT_DECLARED);
      expect(notDeclared).toHaveLength(2); // PUT e PATCH
    });

    it('deve retornar array vazio para entradas nulas ou invalidas', () => {
      expect(filterCellsByStatus(null, CELL_STATUS.CONNECTED)).toEqual([]);
      expect(filterCellsByStatus(result, null)).toEqual([]);
    });
  });

  describe('calculateMatrixSummary', () => {
    it('deve calcular metricas precisas a partir de uma matriz estruturada', () => {
      const routeGet = createRoute({
        method: 'GET',
        canonicalPath: '/api/users',
        filePath: 'server.js',
        line: 1,
      });
      const callGet = createHttpCall({
        method: 'GET',
        canonicalPath: '/api/users',
        filePath: 'client.js',
        line: 5,
      });
      const routePost = createRoute({
        method: 'POST',
        canonicalPath: '/api/users',
        filePath: 'server.js',
        line: 10,
      });
      const callDelete = createHttpCall({
        method: 'DELETE',
        canonicalPath: '/api/users',
        filePath: 'client.js',
        line: 15,
      });

      const result = matchRoutesAndCalls([routeGet, routePost], [callGet, callDelete]);
      const summary = calculateMatrixSummary(result);

      expect(summary.totalResources).toBe(1);
      expect(summary.totalOperations).toBe(5);
      expect(summary.connected).toBe(1);
      expect(summary.backendOnly).toBe(1);
      expect(summary.frontendOnly).toBe(1);
      expect(summary.notDeclared).toBe(2);
      expect(summary.inconclusive).toBe(0);
      expect(summary.totalRoutes).toBe(2);
      expect(summary.totalCalls).toBe(2);
      expect(summary.coveragePercentage).toBe(50.0); // 1 connected de 2 rotas declaradas no backend = 50%
    });

    it('deve suportar calculo a partir de array plano de celulas', () => {
      const result = matchRoutesAndCalls([], []);
      const summary = calculateMatrixSummary(result.flatCells);

      expect(summary.totalResources).toBe(0);
      expect(summary.totalOperations).toBe(0);
      expect(summary.connected).toBe(0);
      expect(summary.coveragePercentage).toBe(0);
    });

    it('deve retornar sumario com zeros para matriz vazia ou nula', () => {
      const summary = calculateMatrixSummary(null);
      expect(summary.totalResources).toBe(0);
      expect(summary.totalOperations).toBe(0);
      expect(summary.connected).toBe(0);
      expect(summary.backendOnly).toBe(0);
      expect(summary.frontendOnly).toBe(0);
      expect(summary.notDeclared).toBe(0);
      expect(summary.coveragePercentage).toBe(0);
    });
  });

  describe('matchRoutesAndCalls - Cruzamento Relacional', () => {
    it('deve conciliar rota Express parametrizada com chamada template literal do frontend', () => {
      const backendRoute = createRoute({
        method: 'GET',
        rawPath: '/api/users/:userId',
        canonicalPath: '/api/users/:param',
        filePath: 'server/routes/users.js',
        line: 42,
        middlewares: ['auth'],
        handlerName: 'getUser',
      });

      const frontendCall = createHttpCall({
        method: 'GET',
        rawUrl: '/api/users/${id}',
        canonicalPath: '/api/users/:param',
        filePath: 'src/components/UserProfile.jsx',
        line: 18,
        callerName: 'UserProfile',
        clientType: 'axios',
      });

      const result = matchRoutesAndCalls([backendRoute], [frontendCall]);

      expect(result.resources).toEqual(['/api/users/:param']);
      expect(result.totalResources).toBe(1);

      const cellGet = result.matrix['/api/users/:param'].GET;
      expect(cellGet.status).toBe(CELL_STATUS.CONNECTED);
      expect(cellGet.consumersCount).toBe(1);
      expect(cellGet.routes).toHaveLength(1);
      expect(cellGet.calls).toHaveLength(1);
      expect(cellGet.routes[0].handlerName).toBe('getUser');
      expect(cellGet.calls[0].callerName).toBe('UserProfile');

      // Os outros metodos devem estar NOT_DECLARED
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        const cell = result.matrix['/api/users/:param'][method];
        expect(cell.status).toBe(CELL_STATUS.NOT_DECLARED);
        expect(cell.consumersCount).toBe(0);
        expect(cell.routes).toHaveLength(0);
        expect(cell.calls).toHaveLength(0);
      }
    });

    it('deve conciliar rotas com concatenacao de strings e query strings ignoradas', () => {
      const backendRoute = createRoute({
        method: 'GET',
        rawPath: '/api/items',
        canonicalPath: '/api/items',
        filePath: 'server/routes/items.js',
        line: 10,
      });

      const frontendCallWithQuery = createHttpCall({
        method: 'GET',
        rawUrl: '/api/items?page=1&limit=20',
        canonicalPath: '/api/items',
        filePath: 'src/services/items.js',
        line: 12,
      });

      const result = matchRoutesAndCalls([backendRoute], [frontendCallWithQuery]);
      const cell = result.matrix['/api/items'].GET;

      expect(cell.status).toBe(CELL_STATUS.CONNECTED);
      expect(cell.consumersCount).toBe(1);
    });

    it('deve identificar operacoes BACKEND_ONLY (rotas orfas)', () => {
      const backendRoute = createRoute({
        method: 'DELETE',
        rawPath: '/api/users/:id',
        canonicalPath: '/api/users/:param',
        filePath: 'server/routes/users.js',
        line: 85,
      });

      const result = matchRoutesAndCalls([backendRoute], []);
      const cellDelete = result.matrix['/api/users/:param'].DELETE;

      expect(cellDelete.status).toBe(CELL_STATUS.BACKEND_ONLY);
      expect(cellDelete.consumersCount).toBe(0);
      expect(cellDelete.routes).toHaveLength(1);
      expect(cellDelete.calls).toHaveLength(0);
    });

    it('deve identificar operacoes FRONTEND_ONLY (chamadas quebradas / potencial 404)', () => {
      const frontendCall = createHttpCall({
        method: 'POST',
        rawUrl: '/api/legacy-action',
        canonicalPath: '/api/legacy-action',
        filePath: 'src/components/LegacyButton.jsx',
        line: 30,
      });

      const result = matchRoutesAndCalls([], [frontendCall]);
      const cellPost = result.matrix['/api/legacy-action'].POST;

      expect(cellPost.status).toBe(CELL_STATUS.FRONTEND_ONLY);
      expect(cellPost.consumersCount).toBe(1);
      expect(cellPost.routes).toHaveLength(0);
      expect(cellPost.calls).toHaveLength(1);
    });

    it('deve acumular multiplos consumidores na contagem de consumersCount', () => {
      const route = createRoute({
        method: 'GET',
        canonicalPath: '/api/products',
        filePath: 'server/routes/products.js',
        line: 15,
      });

      const call1 = createHttpCall({
        method: 'GET',
        canonicalPath: '/api/products',
        filePath: 'src/pages/Catalog.jsx',
        line: 22,
        callerName: 'CatalogPage',
      });
      const call2 = createHttpCall({
        method: 'GET',
        canonicalPath: '/api/products',
        filePath: 'src/components/HeaderSearch.jsx',
        line: 45,
        callerName: 'HeaderSearch',
      });
      const call3 = createHttpCall({
        method: 'GET',
        canonicalPath: '/api/products',
        filePath: 'src/services/cartService.js',
        line: 80,
        callerName: 'syncCartProducts',
      });

      const result = matchRoutesAndCalls([route], [call1, call2, call3]);
      const cell = result.matrix['/api/products'].GET;

      expect(cell.status).toBe(CELL_STATUS.CONNECTED);
      expect(cell.consumersCount).toBe(3);
      expect(cell.calls).toHaveLength(3);
      expect(cell.calls.map((c) => c.callerName)).toEqual([
        'CatalogPage',
        'HeaderSearch',
        'syncCartProducts',
      ]);
    });

    it('deve suportar multiplas declaracoes de backend para a mesma rota e metodo', () => {
      const routeV1 = createRoute({
        method: 'GET',
        canonicalPath: '/api/health',
        filePath: 'server/v1/health.js',
        line: 10,
        handlerName: 'healthCheckV1',
      });
      const routeV2 = createRoute({
        method: 'GET',
        canonicalPath: '/api/health',
        filePath: 'server/v2/health.js',
        line: 12,
        handlerName: 'healthCheckV2',
      });

      const result = matchRoutesAndCalls([routeV1, routeV2], []);
      const cell = result.matrix['/api/health'].GET;

      expect(cell.status).toBe(CELL_STATUS.BACKEND_ONLY);
      expect(cell.routes).toHaveLength(2);
      expect(cell.routes.map((r) => r.handlerName)).toEqual(['healthCheckV1', 'healthCheckV2']);
    });

    it('deve ordenar os recursos unicos em ordem alfabetica', () => {
      const routes = [
        createRoute({ method: 'GET', canonicalPath: '/api/users', filePath: 'a.js', line: 1 }),
        createRoute({ method: 'GET', canonicalPath: '/api/auth/login', filePath: 'b.js', line: 1 }),
        createRoute({ method: 'GET', canonicalPath: '/api/posts', filePath: 'c.js', line: 1 }),
        createRoute({ method: 'GET', canonicalPath: '/api/users/:param', filePath: 'd.js', line: 1 }),
      ];

      const result = matchRoutesAndCalls(routes, []);

      expect(result.resources).toEqual([
        '/api/auth/login',
        '/api/posts',
        '/api/users',
        '/api/users/:param',
      ]);
      expect(Object.keys(result.matrix)).toEqual([
        '/api/auth/login',
        '/api/posts',
        '/api/users',
        '/api/users/:param',
      ]);
    });

    it('deve reconciliar rota raiz /', () => {
      const route = createRoute({
        method: 'GET',
        canonicalPath: '/',
        filePath: 'server.js',
        line: 5,
      });
      const call = createHttpCall({
        method: 'GET',
        canonicalPath: '/',
        filePath: 'client.js',
        line: 10,
      });

      const result = matchRoutesAndCalls([route], [call]);
      expect(result.resources).toEqual(['/']);
      expect(result.matrix['/'].GET.status).toBe(CELL_STATUS.CONNECTED);
    });

    it('deve lidar com entradas vazias e nulas graciosamente', () => {
      const resultEmpty = matchRoutesAndCalls([], []);
      expect(resultEmpty.resources).toEqual([]);
      expect(resultEmpty.matrix).toEqual({});
      expect(resultEmpty.flatCells).toEqual([]);
      expect(resultEmpty.totalResources).toBe(0);
      expect(resultEmpty.totalRoutes).toBe(0);
      expect(resultEmpty.totalCalls).toBe(0);

      const resultNull = matchRoutesAndCalls(null, null);
      expect(resultNull.resources).toEqual([]);
      expect(resultNull.matrix).toEqual({});
      expect(resultNull.flatCells).toEqual([]);
    });

    it('deve ignorar metodos HTTP nao suportados', () => {
      const routeUnsupported = {
        method: 'OPTIONS',
        canonicalPath: '/api/test',
        filePath: 'server.js',
        line: 1,
      };
      const callUnsupported = {
        method: 'HEAD',
        canonicalPath: '/api/test',
        filePath: 'client.js',
        line: 1,
      };

      const result = matchRoutesAndCalls([routeUnsupported], [callUnsupported]);
      expect(result.resources).toEqual([]);
      expect(result.matrix).toEqual({});
    });

    it('deve propagar auditId informado nas opcoes para cada celula', () => {
      const route = createRoute({
        method: 'GET',
        canonicalPath: '/api/profile',
        filePath: 'server.js',
        line: 1,
      });

      const result = matchRoutesAndCalls([route], [], { auditId: 'audit-2026-xyz' });
      const cell = result.matrix['/api/profile'].GET;

      expect(cell.auditId).toBe('audit-2026-xyz');
    });

    it('deve garantir imutabilidade da estrutura retornada', () => {
      const route = createRoute({
        method: 'GET',
        canonicalPath: '/api/test',
        filePath: 'server.js',
        line: 1,
      });

      const result = matchRoutesAndCalls([route], []);

      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.resources)).toBe(true);
      expect(Object.isFrozen(result.matrix)).toBe(true);
      expect(Object.isFrozen(result.matrix['/api/test'])).toBe(true);
      expect(Object.isFrozen(result.flatCells)).toBe(true);
      expect(Object.isFrozen(result.summary)).toBe(true);
      expect(Object.isFrozen(result.matrix['/api/test'].GET)).toBe(true);
      expect(Object.isFrozen(result.matrix['/api/test'].GET.routes)).toBe(true);
      expect(Object.isFrozen(result.matrix['/api/test'].GET.calls)).toBe(true);
    });

    it('deve evidenciar conflito de metodo HTTP no mesmo recurso', () => {
      // Backend disponibiliza apenas GET
      const route = createRoute({
        method: 'GET',
        canonicalPath: '/api/settings',
        filePath: 'server/routes/settings.js',
        line: 20,
      });

      // Frontend tenta enviar POST
      const call = createHttpCall({
        method: 'POST',
        canonicalPath: '/api/settings',
        filePath: 'src/components/SettingsForm.jsx',
        line: 55,
      });

      const result = matchRoutesAndCalls([route], [call]);
      const resourceMap = result.matrix['/api/settings'];

      expect(resourceMap.GET.status).toBe(CELL_STATUS.BACKEND_ONLY);
      expect(resourceMap.POST.status).toBe(CELL_STATUS.FRONTEND_ONLY);
      expect(resourceMap.PUT.status).toBe(CELL_STATUS.NOT_DECLARED);
      expect(resourceMap.PATCH.status).toBe(CELL_STATUS.NOT_DECLARED);
      expect(resourceMap.DELETE.status).toBe(CELL_STATUS.NOT_DECLARED);
    });
  });
});
