import { describe, it, expect } from 'vitest';
import { parseSourceToAst } from '../../src/parsers/ast-parser.js';
import {
  combineRoutePaths,
  extractPathFromNode,
  extractExpressionName,
  extractMiddlewareNames,
  extractHandlerName,
  extractRouterMounts,
  extractExpressRoutes,
  EXPRESS_ROUTING_METHODS,
} from '../../src/analyzers/express-route-analyzer.js';

describe('express-route-analyzer', () => {
  describe('EXPRESS_ROUTING_METHODS', () => {
    it('deve exportar lista imutavel com todos os metodos express suportados', () => {
      expect(Object.isFrozen(EXPRESS_ROUTING_METHODS)).toBe(true);
      expect(EXPRESS_ROUTING_METHODS).toEqual([
        'get',
        'post',
        'put',
        'patch',
        'delete',
        'all',
        'options',
        'head',
      ]);
    });
  });

  describe('combineRoutePaths', () => {
    it('deve combinar prefixo e caminho normalizando barras duplas e finais', () => {
      expect(combineRoutePaths('/api', '/users')).toBe('/api/users');
      expect(combineRoutePaths('/api/', '/users')).toBe('/api/users');
      expect(combineRoutePaths('/api', 'users')).toBe('/api/users');
      expect(combineRoutePaths('/api/', '/users/')).toBe('/api/users');
    });

    it('deve lidar com rotas raiz e caminhos vazios adequadamente', () => {
      expect(combineRoutePaths('', '/users')).toBe('/users');
      expect(combineRoutePaths('/api', '')).toBe('/api');
      expect(combineRoutePaths('/api', '/')).toBe('/api');
      expect(combineRoutePaths('/', '/users')).toBe('/users');
      expect(combineRoutePaths('', '')).toBe('/');
      expect(combineRoutePaths('/', '/')).toBe('/');
    });

    it('deve aceitar caminhos com parametros aninhados', () => {
      expect(combineRoutePaths('/api/v1', '/users/:id/orders')).toBe('/api/v1/users/:id/orders');
    });
  });

  describe('extractPathFromNode', () => {
    it('deve extrair caminho de StringLiteral', () => {
      const { ast } = parseSourceToAst("app.get('/api/users', handler);");
      const callArg = ast.program.body[0].expression.arguments[0];
      expect(extractPathFromNode(callArg)).toBe('/api/users');
    });

    it('deve extrair caminho de TemplateLiteral estatico e interpolado', () => {
      const { ast: astStatic } = parseSourceToAst('app.get(`/api/static`, handler);');
      const staticArg = astStatic.program.body[0].expression.arguments[0];
      expect(extractPathFromNode(staticArg)).toBe('/api/static');

      const { ast: astDynamic } = parseSourceToAst('app.get(`/api/users/${userId}/posts/${postId}`, handler);');
      const dynamicArg = astDynamic.program.body[0].expression.arguments[0];
      expect(extractPathFromNode(dynamicArg)).toBe('/api/users/:userId/posts/:postId');
    });

    it('deve extrair caminho de BinaryExpression com concatenacao de strings', () => {
      const { ast: astConcat } = parseSourceToAst("app.get('/api/' + 'v1/users', handler);");
      const concatArg = astConcat.program.body[0].expression.arguments[0];
      expect(extractPathFromNode(concatArg)).toBe('/api/v1/users');

      const { ast: astVar } = parseSourceToAst("app.get('/api/users/' + id, handler);");
      const varArg = astVar.program.body[0].expression.arguments[0];
      expect(extractPathFromNode(varArg)).toBe('/api/users/:id');
    });

    it('deve retornar null para nos nao compativeis com caminho', () => {
      expect(extractPathFromNode(null)).toBeNull();
      expect(extractPathFromNode({ type: 'NumericLiteral', value: 42 })).toBeNull();
    });
  });

  describe('extractExpressionName', () => {
    it('deve extrair nomes de Identifiers e MemberExpressions simples e aninhadas', () => {
      const { ast } = parseSourceToAst(`
        app.get('/test', authMiddleware, userController.profile, handlers.users.list);
      `);
      const args = ast.program.body[0].expression.arguments;

      expect(extractExpressionName(args[1])).toBe('authMiddleware');
      expect(extractExpressionName(args[2])).toBe('userController.profile');
      expect(extractExpressionName(args[3])).toBe('handlers.users.list');
    });

    it('deve extrair nomes de chamadas de funcoes middleware parametrizadas', () => {
      const { ast } = parseSourceToAst("app.get('/test', checkRole('admin'), handler);");
      const callArg = ast.program.body[0].expression.arguments[1];
      expect(extractExpressionName(callArg)).toBe('checkRole()');
    });

    it('deve retornar anonymous para funcoes anonimas ou arrow functions', () => {
      const { ast } = parseSourceToAst("app.get('/test', (req, res) => {}, function() {});");
      const args = ast.program.body[0].expression.arguments;
      expect(extractExpressionName(args[1])).toBe('anonymous');
      expect(extractExpressionName(args[2])).toBe('anonymous');
    });

    it('deve extrair identificador de funcoes nomeadas', () => {
      const { ast } = parseSourceToAst("app.get('/test', function customHandler(req, res) {});");
      const handlerArg = ast.program.body[0].expression.arguments[1];
      expect(extractExpressionName(handlerArg)).toBe('customHandler');
    });
  });

  describe('extractMiddlewareNames', () => {
    it('deve extrair lista linear de middlewares e achatar arrays aninhados', () => {
      const { ast } = parseSourceToAst(`
        app.get('/test', auth, [checkRole('admin'), auditLog], controller);
      `);
      const args = ast.program.body[0].expression.arguments.slice(1, -1);
      const middlewares = extractMiddlewareNames(args);

      expect(middlewares).toEqual(['auth', 'checkRole()', 'auditLog']);
    });

    it('deve retornar array vazio se argumentos nao forem fornecidos', () => {
      expect(extractMiddlewareNames(null)).toEqual([]);
      expect(extractMiddlewareNames([])).toEqual([]);
    });
  });

  describe('extractRouterMounts', () => {
    it('deve mapear montagens de sub-roteadores via app.use e router.use', () => {
      const code = `
        const express = require('express');
        const app = express();
        const apiRouter = express.Router();
        const userRouter = express.Router();

        app.use('/api', apiRouter);
        apiRouter.use('/users', userRouter);
        app.use(express.json());
      `;
      const { ast } = parseSourceToAst(code);
      const mounts = extractRouterMounts(ast);

      expect(mounts).toHaveLength(2);
      expect(mounts).toEqual([
        { parentRouter: 'app', prefix: '/api', childRouter: 'apiRouter' },
        { parentRouter: 'apiRouter', prefix: '/users', childRouter: 'userRouter' },
      ]);
    });

    it('deve ignorar middlewares globais sem rota prefixada', () => {
      const { ast } = parseSourceToAst('app.use(cors()); app.use(express.json());');
      const mounts = extractRouterMounts(ast);
      expect(mounts).toEqual([]);
    });
  });

  describe('extractExpressRoutes', () => {
    it('deve retornar array vazio para entradas nulas, vazias ou com erro sintatico', () => {
      expect(extractExpressRoutes(null)).toEqual([]);
      expect(extractExpressRoutes(undefined)).toEqual([]);
      expect(extractExpressRoutes({ ok: false, error: {} })).toEqual([]);
      expect(extractExpressRoutes({ ok: true, ast: null })).toEqual([]);
      expect(extractExpressRoutes('codigo em string nao ast')).toEqual([]);
    });

    it('deve extrair rotas diretas nos verbos HTTP suportados', () => {
      const code = `
        app.get('/users', listUsers);
        app.post('/users', auth, createUser);
        app.put('/users/:id', auth, updateUser);
        app.patch('/users/:id/status', auth, patchStatus);
        app.delete('/users/:id', auth, checkAdmin, deleteUser);
      `;
      const parseResult = parseSourceToAst(code, 'server/routes.js');
      const routes = extractExpressRoutes(parseResult);

      expect(routes).toHaveLength(5);

      const [rGet, rPost, rPut, rPatch, rDelete] = routes;

      expect(rGet).toMatchObject({
        method: 'GET',
        canonicalPath: '/users',
        rawPath: '/users',
        filePath: 'server/routes.js',
        middlewares: [],
        handlerName: 'listUsers',
      });

      expect(rPost).toMatchObject({
        method: 'POST',
        canonicalPath: '/users',
        rawPath: '/users',
        filePath: 'server/routes.js',
        middlewares: ['auth'],
        handlerName: 'createUser',
      });

      expect(rPut).toMatchObject({
        method: 'PUT',
        canonicalPath: '/users/:id',
        middlewares: ['auth'],
        handlerName: 'updateUser',
      });

      expect(rPatch).toMatchObject({
        method: 'PATCH',
        canonicalPath: '/users/:id/status',
        middlewares: ['auth'],
        handlerName: 'patchStatus',
      });

      expect(rDelete).toMatchObject({
        method: 'DELETE',
        canonicalPath: '/users/:id',
        middlewares: ['auth', 'checkAdmin'],
        handlerName: 'deleteUser',
      });
    });

    it('deve expandir app.all() para todos os cinco verbos HTTP suportados', () => {
      const code = "app.all('/health', healthCheck);";
      const parseResult = parseSourceToAst(code, 'server/app.js');
      const routes = extractExpressRoutes(parseResult);

      expect(routes).toHaveLength(5);
      const methods = routes.map((r) => r.method);
      expect(methods).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
      expect(routes.every((r) => r.canonicalPath === '/health')).toBe(true);
      expect(routes.every((r) => r.handlerName === 'healthCheck')).toBe(true);
    });

    it('deve ignorar com seguranca metodos nao pertencentes a matriz REST como options e head', () => {
      const code = `
        app.options('/api/cors', corsHandler);
        app.head('/api/ping', pingHandler);
        app.get('/api/ping', pingHandler);
      `;
      const parseResult = parseSourceToAst(code, 'server/cors.js');
      const routes = extractExpressRoutes(parseResult);

      expect(routes).toHaveLength(1);
      expect(routes[0].method).toBe('GET');
      expect(routes[0].canonicalPath).toBe('/api/ping');
    });

    it('deve suportar rotas declaradas com array de caminhos', () => {
      const code = "app.get(['/users', '/clients'], listUsers);";
      const parseResult = parseSourceToAst(code, 'server/app.js');
      const routes = extractExpressRoutes(parseResult);

      expect(routes).toHaveLength(2);
      expect(routes[0].canonicalPath).toBe('/users');
      expect(routes[1].canonicalPath).toBe('/clients');
    });

    it('deve extrair rotas encadeadas fluentemente via router.route().get().post()', () => {
      const code = `
        router.route('/items')
          .get(auth, getItems)
          .post(auth, validateItem, createItem)
          .delete(auth, checkAdmin, deleteItem);
      `;
      const parseResult = parseSourceToAst(code, 'server/items.router.js');
      const routes = extractExpressRoutes(parseResult);

      expect(routes).toHaveLength(3);

      const [rGet, rPost, rDelete] = routes;

      expect(rGet).toMatchObject({
        method: 'GET',
        canonicalPath: '/items',
        rawPath: '/items',
        filePath: 'server/items.router.js',
        middlewares: ['auth'],
        handlerName: 'getItems',
      });

      expect(rPost).toMatchObject({
        method: 'POST',
        canonicalPath: '/items',
        rawPath: '/items',
        filePath: 'server/items.router.js',
        middlewares: ['auth', 'validateItem'],
        handlerName: 'createItem',
      });

      expect(rDelete).toMatchObject({
        method: 'DELETE',
        canonicalPath: '/items',
        rawPath: '/items',
        filePath: 'server/items.router.js',
        middlewares: ['auth', 'checkAdmin'],
        handlerName: 'deleteItem',
      });

      expect(rGet.line).toBeGreaterThan(0);
      expect(rPost.line).toBeGreaterThan(0);
      expect(rDelete.line).toBeGreaterThan(0);
    });

    it('deve compor prefixos de sub-roteadores aninhados via app.use e router.use', () => {
      const code = `
        const express = require('express');
        const app = express();
        const apiRouter = express.Router();
        const userRouter = express.Router();

        userRouter.get('/:id', getUser);
        userRouter.post('/', createUser);

        apiRouter.use('/users', userRouter);
        app.use('/api/v1', apiRouter);
      `;
      const parseResult = parseSourceToAst(code, 'server/index.js');
      const routes = extractExpressRoutes(parseResult);

      expect(routes).toHaveLength(2);
      const paths = routes.map((r) => r.canonicalPath);
      expect(paths).toContain('/api/v1/users/:id');
      expect(paths).toContain('/api/v1/users');
    });

    it('deve aplicar options.prefix como prefixo base quando fornecido', () => {
      const code = `
        router.get('/products', listProducts);
        router.post('/products', createProduct);
      `;
      const parseResult = parseSourceToAst(code, 'server/products.js');
      const routes = extractExpressRoutes(parseResult, 'server/products.js', { prefix: '/api/v2' });

      expect(routes).toHaveLength(2);
      expect(routes[0].canonicalPath).toBe('/api/v2/products');
      expect(routes[1].canonicalPath).toBe('/api/v2/products');
    });

    it('deve retornar array vazio para arquivos JavaScript sem definicoes de rota', () => {
      const code = `
        export function sum(a, b) {
          return a + b;
        }
        const config = { port: 3000 };
      `;
      const parseResult = parseSourceToAst(code, 'utils/math.js');
      const routes = extractExpressRoutes(parseResult);
      expect(routes).toEqual([]);
    });

    it('deve instanciar entidades congeladas conformes com createRoute', () => {
      const code = "app.get('/status', (req, res) => res.send('ok'));";
      const parseResult = parseSourceToAst(code, 'server.js');
      const [route] = extractExpressRoutes(parseResult);

      expect(Object.isFrozen(route)).toBe(true);
      expect(Object.isFrozen(route.middlewares)).toBe(true);
      expect(route.handlerName).toBe('anonymous');
      expect(typeof route.line).toBe('number');
      expect(typeof route.column).toBe('number');
    });
  });
});
