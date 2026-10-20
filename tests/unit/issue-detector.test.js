import { describe, it, expect } from 'vitest';
import {
  calculateLevenshteinDistance,
  findNearDuplicateRoutes,
  isUiComponentFile,
  calculateIssueSummary,
  filterIssuesBySeverity,
  filterIssuesByType,
  sortIssuesBySeverity,
  detectProjectIssues,
} from '../../src/analyzers/issue-detector.js';
import { matchRoutesAndCalls } from '../../src/analyzers/route-matcher.js';
import {
  HTTP_METHODS,
  CELL_STATUS,
  ISSUE_SEVERITY,
  ISSUE_TYPE,
  createRoute,
  createHttpCall,
  createMatrixCell,
  createIssue,
} from '../../src/types/domain-contracts.js';

describe('issue-detector', () => {
  describe('calculateLevenshteinDistance', () => {
    it('deve retornar 0 para strings identicas', () => {
      expect(calculateLevenshteinDistance('', '')).toBe(0);
      expect(calculateLevenshteinDistance('users', 'users')).toBe(0);
      expect(calculateLevenshteinDistance('/api/v1/resource', '/api/v1/resource')).toBe(0);
    });

    it('deve retornar o comprimento da outra string quando uma for vazia', () => {
      expect(calculateLevenshteinDistance('', 'abc')).toBe(3);
      expect(calculateLevenshteinDistance('hello', '')).toBe(5);
    });

    it('deve calcular a distancia para insercao de caractere singular', () => {
      expect(calculateLevenshteinDistance('/api/user', '/api/users')).toBe(1);
      expect(calculateLevenshteinDistance('/api/posts', '/api/post')).toBe(1);
    });

    it('deve calcular a distancia para substituicao de caractere', () => {
      expect(calculateLevenshteinDistance('cat', 'hat')).toBe(1);
      expect(calculateLevenshteinDistance('/api/item', '/api/atom')).toBe(2);
    });

    it('deve calcular a distancia classica para palavras de teste', () => {
      expect(calculateLevenshteinDistance('kitten', 'sitting')).toBe(3);
      expect(calculateLevenshteinDistance('saturday', 'sunday')).toBe(3);
    });

    it('deve lancar TypeError se algum argumento nao for string', () => {
      expect(() => calculateLevenshteinDistance(null, 'abc')).toThrow(TypeError);
      expect(() => calculateLevenshteinDistance('abc', 123)).toThrow(TypeError);
      expect(() => calculateLevenshteinDistance(undefined, undefined)).toThrow(TypeError);
    });
  });

  describe('findNearDuplicateRoutes', () => {
    it('deve detectar pares de rotas com distancia <= 1 por padrao', () => {
      const resources = ['/api/user', '/api/users', '/api/products', '/api/orders'];
      const duplicates = findNearDuplicateRoutes(resources);

      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]).toEqual({
        routeA: '/api/user',
        routeB: '/api/users',
        distance: 1,
      });
    });

    it('deve ignorar rotas com distancia superior ao threshold', () => {
      const resources = ['/api/products', '/api/categories', '/api/customers'];
      const duplicates = findNearDuplicateRoutes(resources, 1);
      expect(duplicates).toHaveLength(0);
    });

    it('deve respeitar threshold customizado maior', () => {
      const resources = ['/api/category', '/api/categories'];
      const dist = calculateLevenshteinDistance('/api/category', '/api/categories');
      expect(dist).toBe(3);

      expect(findNearDuplicateRoutes(resources, 1)).toHaveLength(0);
      const duplicatesThreshold3 = findNearDuplicateRoutes(resources, 3);
      expect(duplicatesThreshold3).toHaveLength(1);
      expect(duplicatesThreshold3[0].distance).toBe(3);
    });

    it('nao deve comparar uma rota consigo mesma ou gerar pares simetricos duplicados', () => {
      const resources = ['/api/user', '/api/user', '/api/users'];
      const duplicates = findNearDuplicateRoutes(resources, 1);
      expect(duplicates).toHaveLength(1);
    });

    it('deve retornar array vazio para entradas invalidas ou vazias', () => {
      expect(findNearDuplicateRoutes([])).toEqual([]);
      expect(findNearDuplicateRoutes(null)).toEqual([]);
      expect(findNearDuplicateRoutes(['/api/single'])).toEqual([]);
    });
  });

  describe('isUiComponentFile', () => {
    it('deve reconhecer arquivos em pastas de componentes e telas', () => {
      expect(isUiComponentFile('src/components/UserList.jsx')).toBe(true);
      expect(isUiComponentFile('src/pages/Dashboard.jsx')).toBe(true);
      expect(isUiComponentFile('src/views/ProfileView.js')).toBe(true);
      expect(isUiComponentFile('src/screens/HomeScreen.js')).toBe(true);
      expect(isUiComponentFile('src/ui/Button.jsx')).toBe(true);
    });

    it('deve reconhecer extensoes .jsx e .tsx fora de servicos', () => {
      expect(isUiComponentFile('src/widgets/Sidebar.jsx')).toBe(true);
      expect(isUiComponentFile('src/features/auth/LoginModal.tsx')).toBe(true);
    });

    it('deve normalizar caminhos do Windows com barras invertidas', () => {
      expect(isUiComponentFile('src\\components\\UserList.jsx')).toBe(true);
      expect(isUiComponentFile('src\\pages\\Dashboard.jsx')).toBe(true);
    });

    it('deve retornar false para modulos de servico, api e cliente HTTP', () => {
      expect(isUiComponentFile('src/services/userService.js')).toBe(false);
      expect(isUiComponentFile('src/api/authClient.js')).toBe(false);
      expect(isUiComponentFile('src/clients/httpClient.js')).toBe(false);
      expect(isUiComponentFile('src/sdk/analytics.js')).toBe(false);
      expect(isUiComponentFile('src/repositories/userRepository.js')).toBe(false);
    });

    it('deve retornar false para arquivos utilitarios ou nao-ui', () => {
      expect(isUiComponentFile('src/utils/formatters.js')).toBe(false);
      expect(isUiComponentFile('src/helpers/date.js')).toBe(false);
      expect(isUiComponentFile('server/routes/users.js')).toBe(false);
      expect(isUiComponentFile('')).toBe(false);
      expect(isUiComponentFile(null)).toBe(false);
    });
  });

  describe('calculateIssueSummary', () => {
    it('deve consolidar metricas por severidade e por tipo', () => {
      const issues = [
        createIssue({
          severity: ISSUE_SEVERITY.HIGH,
          type: ISSUE_TYPE.BROKEN_CALL,
          canonicalPath: '/api/missing',
          message: 'Chamada sem rota',
        }),
        createIssue({
          severity: ISSUE_SEVERITY.HIGH,
          type: ISSUE_TYPE.METHOD_MISMATCH,
          canonicalPath: '/api/users',
          method: 'POST',
          message: 'Metodo divergente',
        }),
        createIssue({
          severity: ISSUE_SEVERITY.MEDIUM,
          type: ISSUE_TYPE.ORPHAN_ENDPOINT,
          canonicalPath: '/api/legacy',
          method: 'GET',
          message: 'Endpoint orfao',
        }),
        createIssue({
          severity: ISSUE_SEVERITY.LOW,
          type: ISSUE_TYPE.UNORGANIZED_CALLS,
          canonicalPath: '/api/items',
          message: 'Chamada em componente',
        }),
      ];

      const summary = calculateIssueSummary(issues);

      expect(summary.total).toBe(4);
      expect(summary.highSeverityCount).toBe(2);
      expect(summary.mediumSeverityCount).toBe(1);
      expect(summary.lowSeverityCount).toBe(1);

      expect(summary.bySeverity.HIGH).toBe(2);
      expect(summary.bySeverity.MEDIUM).toBe(1);
      expect(summary.bySeverity.LOW).toBe(1);

      expect(summary.byType.BROKEN_CALL).toBe(1);
      expect(summary.byType.METHOD_MISMATCH).toBe(1);
      expect(summary.byType.ORPHAN_ENDPOINT).toBe(1);
      expect(summary.byType.NEAR_DUPLICATE).toBe(0);
      expect(summary.byType.UNORGANIZED_CALLS).toBe(1);
    });

    it('deve retornar contadores zerados para lista vazia', () => {
      const summary = calculateIssueSummary([]);
      expect(summary.total).toBe(0);
      expect(summary.highSeverityCount).toBe(0);
      expect(summary.mediumSeverityCount).toBe(0);
      expect(summary.lowSeverityCount).toBe(0);
    });
  });

  describe('filtros e ordenacao de issues', () => {
    const issues = [
      createIssue({
        severity: ISSUE_SEVERITY.LOW,
        type: ISSUE_TYPE.UNORGANIZED_CALLS,
        canonicalPath: '/api/c',
        message: 'Low issue',
      }),
      createIssue({
        severity: ISSUE_SEVERITY.HIGH,
        type: ISSUE_TYPE.BROKEN_CALL,
        canonicalPath: '/api/b',
        message: 'High issue',
      }),
      createIssue({
        severity: ISSUE_SEVERITY.MEDIUM,
        type: ISSUE_TYPE.ORPHAN_ENDPOINT,
        canonicalPath: '/api/a',
        message: 'Medium issue',
      }),
    ];

    it('deve filtrar issues por severidade', () => {
      expect(filterIssuesBySeverity(issues, 'HIGH')).toHaveLength(1);
      expect(filterIssuesBySeverity(issues, 'MEDIUM')).toHaveLength(1);
      expect(filterIssuesBySeverity(issues, 'LOW')).toHaveLength(1);
      expect(filterIssuesBySeverity(issues, 'UNKNOWN')).toHaveLength(0);
    });

    it('deve filtrar issues por tipo', () => {
      expect(filterIssuesByType(issues, 'BROKEN_CALL')).toHaveLength(1);
      expect(filterIssuesByType(issues, 'NEAR_DUPLICATE')).toHaveLength(0);
    });

    it('deve ordenar issues por severidade (HIGH > MEDIUM > LOW)', () => {
      const sorted = sortIssuesBySeverity(issues);
      expect(sorted[0].severity).toBe(ISSUE_SEVERITY.HIGH);
      expect(sorted[1].severity).toBe(ISSUE_SEVERITY.MEDIUM);
      expect(sorted[2].severity).toBe(ISSUE_SEVERITY.LOW);
    });
  });

  describe('detectProjectIssues', () => {
    it('deve identificar BROKEN_CALL quando frontend chama recurso inexistente no backend', () => {
      const calls = [
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/nonexistent',
          filePath: 'src/services/api.js',
          line: 25,
          callerName: 'getNonexistent',
          clientType: 'fetch',
        }),
      ];

      const matrixResult = matchRoutesAndCalls([], calls);
      const issues = detectProjectIssues(matrixResult, [], calls);

      expect(issues.length).toBeGreaterThan(0);
      const broken = filterIssuesByType(issues, ISSUE_TYPE.BROKEN_CALL);
      expect(broken).toHaveLength(1);
      expect(broken[0].severity).toBe(ISSUE_SEVERITY.HIGH);
      expect(broken[0].canonicalPath).toBe('/api/nonexistent');
      expect(broken[0].filePath).toBe('src/services/api.js');
      expect(broken[0].line).toBe(25);
      expect(broken[0].details.clientType).toBe('fetch');
    });

    it('deve identificar METHOD_MISMATCH quando recurso existe mas metodo difere', () => {
      const routes = [
        createRoute({
          method: 'GET',
          canonicalPath: '/api/users',
          filePath: 'server/routes/users.js',
          line: 12,
        }),
      ];
      const calls = [
        createHttpCall({
          method: 'POST',
          canonicalPath: '/api/users',
          filePath: 'src/services/users.js',
          line: 40,
          callerName: 'createUser',
          clientType: 'axios',
        }),
      ];

      const matrixResult = matchRoutesAndCalls(routes, calls);
      const issues = detectProjectIssues(matrixResult, routes, calls);

      const mismatch = filterIssuesByType(issues, ISSUE_TYPE.METHOD_MISMATCH);
      expect(mismatch).toHaveLength(1);
      expect(mismatch[0].severity).toBe(ISSUE_SEVERITY.HIGH);
      expect(mismatch[0].canonicalPath).toBe('/api/users');
      expect(mismatch[0].method).toBe('POST');
      expect(mismatch[0].details.availableMethods).toEqual(['GET']);
      expect(mismatch[0].details.requestedMethod).toBe('POST');
    });

    it('deve identificar ORPHAN_ENDPOINT quando rota backend nao tem consumidor', () => {
      const routes = [
        createRoute({
          method: 'DELETE',
          canonicalPath: '/api/users/:param',
          filePath: 'server/routes/users.js',
          line: 85,
          handlerName: 'deleteUser',
        }),
      ];

      const matrixResult = matchRoutesAndCalls(routes, []);
      const issues = detectProjectIssues(matrixResult, routes, []);

      const orphan = filterIssuesByType(issues, ISSUE_TYPE.ORPHAN_ENDPOINT);
      expect(orphan).toHaveLength(1);
      expect(orphan[0].severity).toBe(ISSUE_SEVERITY.MEDIUM);
      expect(orphan[0].canonicalPath).toBe('/api/users/:param');
      expect(orphan[0].method).toBe('DELETE');
      expect(orphan[0].filePath).toBe('server/routes/users.js');
      expect(orphan[0].line).toBe(85);
      expect(orphan[0].details.handlerName).toBe('deleteUser');
    });

    it('deve identificar NEAR_DUPLICATE para pares de rotas quase-duplicadas', () => {
      const routes = [
        createRoute({
          method: 'GET',
          canonicalPath: '/api/user',
          filePath: 'server/routes/user.js',
          line: 10,
        }),
        createRoute({
          method: 'GET',
          canonicalPath: '/api/users',
          filePath: 'server/routes/users.js',
          line: 10,
        }),
      ];

      const matrixResult = matchRoutesAndCalls(routes, []);
      const issues = detectProjectIssues(matrixResult, routes, []);

      const duplicates = filterIssuesByType(issues, ISSUE_TYPE.NEAR_DUPLICATE);
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0].severity).toBe(ISSUE_SEVERITY.MEDIUM);
      expect(duplicates[0].canonicalPath).toBe('/api/user');
      expect(duplicates[0].details.peerPath).toBe('/api/users');
      expect(duplicates[0].details.distance).toBe(1);
    });

    it('deve identificar UNORGANIZED_CALLS quando chamada e feita diretamente em componente UI', () => {
      const routes = [
        createRoute({
          method: 'GET',
          canonicalPath: '/api/products',
          filePath: 'server/routes/products.js',
          line: 15,
        }),
      ];
      const calls = [
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/products',
          filePath: 'src/components/ProductList.jsx',
          line: 32,
          callerName: 'ProductList',
          clientType: 'fetch',
        }),
      ];

      const matrixResult = matchRoutesAndCalls(routes, calls);
      const issues = detectProjectIssues(matrixResult, routes, calls);

      const unorganized = filterIssuesByType(issues, ISSUE_TYPE.UNORGANIZED_CALLS);
      expect(unorganized).toHaveLength(1);
      expect(unorganized[0].severity).toBe(ISSUE_SEVERITY.LOW);
      expect(unorganized[0].canonicalPath).toBe('/api/products');
      expect(unorganized[0].filePath).toBe('src/components/ProductList.jsx');
      expect(unorganized[0].line).toBe(32);
    });

    it('nao deve sinalizar UNORGANIZED_CALLS para chamadas em camada de servico', () => {
      const routes = [
        createRoute({
          method: 'GET',
          canonicalPath: '/api/products',
          filePath: 'server/routes/products.js',
          line: 15,
        }),
      ];
      const calls = [
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/products',
          filePath: 'src/services/productService.js',
          line: 20,
          callerName: 'fetchProducts',
          clientType: 'axios',
        }),
      ];

      const matrixResult = matchRoutesAndCalls(routes, calls);
      const issues = detectProjectIssues(matrixResult, routes, calls);

      const unorganized = filterIssuesByType(issues, ISSUE_TYPE.UNORGANIZED_CALLS);
      expect(unorganized).toHaveLength(0);
    });

    it('deve retornar zero anomalias para projeto perfeitamente integrado e organizado', () => {
      const routes = [
        createRoute({
          method: 'GET',
          canonicalPath: '/api/products',
          filePath: 'server/routes/products.js',
          line: 10,
        }),
        createRoute({
          method: 'POST',
          canonicalPath: '/api/products',
          filePath: 'server/routes/products.js',
          line: 25,
        }),
      ];
      const calls = [
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/products',
          filePath: 'src/services/productsApi.js',
          line: 14,
        }),
        createHttpCall({
          method: 'POST',
          canonicalPath: '/api/products',
          filePath: 'src/services/productsApi.js',
          line: 28,
        }),
      ];

      const matrixResult = matchRoutesAndCalls(routes, calls);
      const issues = detectProjectIssues(matrixResult, routes, calls);

      expect(issues).toHaveLength(0);
      expect(issues.summary.total).toBe(0);
      expect(issues.summary.highSeverityCount).toBe(0);
      expect(issues.summary.mediumSeverityCount).toBe(0);
      expect(issues.summary.lowSeverityCount).toBe(0);
    });

    it('deve suportar desativacao de quase-duplicatas e chamadas desorganizadas via opcoes', () => {
      const routes = [
        createRoute({
          method: 'GET',
          canonicalPath: '/api/item',
          filePath: 'server/routes/item.js',
          line: 10,
        }),
        createRoute({
          method: 'GET',
          canonicalPath: '/api/items',
          filePath: 'server/routes/items.js',
          line: 10,
        }),
      ];
      const calls = [
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/item',
          filePath: 'src/pages/ItemPage.jsx',
          line: 15,
        }),
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/items',
          filePath: 'src/pages/ItemsPage.jsx',
          line: 15,
        }),
      ];

      const matrixResult = matchRoutesAndCalls(routes, calls);
      const issues = detectProjectIssues(matrixResult, routes, calls, {
        includeNearDuplicates: false,
        includeUnorganizedCalls: false,
      });

      expect(filterIssuesByType(issues, ISSUE_TYPE.NEAR_DUPLICATE)).toHaveLength(0);
      expect(filterIssuesByType(issues, ISSUE_TYPE.UNORGANIZED_CALLS)).toHaveLength(0);
    });

    it('deve aceitar predicado customizado de deteccao de UI', () => {
      const routes = [
        createRoute({
          method: 'GET',
          canonicalPath: '/api/data',
          filePath: 'server/routes/data.js',
          line: 10,
        }),
      ];
      const calls = [
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/data',
          filePath: 'custom/legacy/script.js',
          line: 5,
        }),
      ];

      const matrixResult = matchRoutesAndCalls(routes, calls);
      const issues = detectProjectIssues(matrixResult, routes, calls, {
        uiFilePredicate: (p) => p.includes('legacy'),
      });

      const unorganized = filterIssuesByType(issues, ISSUE_TYPE.UNORGANIZED_CALLS);
      expect(unorganized).toHaveLength(1);
    });

    it('deve atribuir auditId a todas as anomalias detectadas', () => {
      const calls = [
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/missing',
          filePath: 'src/services/api.js',
          line: 10,
        }),
      ];

      const matrixResult = matchRoutesAndCalls([], calls);
      const issues = detectProjectIssues(matrixResult, [], calls, { auditId: 'audit-123' });

      expect(issues.length).toBeGreaterThan(0);
      issues.forEach((issue) => {
        expect(issue.auditId).toBe('audit-123');
      });
    });

    it('deve lidar defensivamente com matriz vazia ou indefinida', () => {
      const issuesNull = detectProjectIssues(null);
      expect(issuesNull).toEqual([]);
      expect(issuesNull.summary.total).toBe(0);

      const issuesEmpty = detectProjectIssues({});
      expect(issuesEmpty).toEqual([]);
      expect(issuesEmpty.summary.total).toBe(0);
    });

    it('deve anexar sumario imutavel ao array retornado', () => {
      const calls = [
        createHttpCall({
          method: 'GET',
          canonicalPath: '/api/broken',
          filePath: 'src/services/api.js',
          line: 10,
        }),
      ];
      const matrixResult = matchRoutesAndCalls([], calls);
      const issues = detectProjectIssues(matrixResult, [], calls);

      expect(Array.isArray(issues)).toBe(true);
      expect(issues.summary).toBeDefined();
      expect(issues.summary.highSeverityCount).toBe(1);
      expect(issues.totalIssues).toBe(1);
      expect(() => {
        issues.summary = {};
      }).toThrow();
    });
  });
});
