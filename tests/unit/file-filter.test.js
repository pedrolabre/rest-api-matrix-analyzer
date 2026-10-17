import { describe, it, expect } from 'vitest';
import {
  ALLOWED_EXTENSIONS,
  IGNORED_DIR_NAMES,
  LOCKFILE_NAMES,
  normalizePathSeparators,
  isIgnoredDirectory,
  isSensitiveFile,
  isMinifiedFile,
  isProcessableFile,
  shouldScanPath,
} from '../../src/parsers/file-filter.js';

describe('file-filter', () => {
  describe('Constantes e integridade dos conjuntos', () => {
    it('deve exportar ALLOWED_EXTENSIONS como colecao congelada com as extensoes esperadas', () => {
      expect(Object.isFrozen(ALLOWED_EXTENSIONS)).toBe(true);
      expect(ALLOWED_EXTENSIONS).toEqual(['.js', '.jsx', '.mjs', '.cjs']);
    });

    it('deve exportar IGNORED_DIR_NAMES como colecao congelada contendo diretorios chave', () => {
      expect(Object.isFrozen(IGNORED_DIR_NAMES)).toBe(true);
      expect(IGNORED_DIR_NAMES).toContain('node_modules');
      expect(IGNORED_DIR_NAMES).toContain('dist');
      expect(IGNORED_DIR_NAMES).toContain('build');
      expect(IGNORED_DIR_NAMES).toContain('.git');
      expect(IGNORED_DIR_NAMES).toContain('.next');
      expect(IGNORED_DIR_NAMES).toContain('coverage');
      expect(IGNORED_DIR_NAMES).toContain('.cache');
    });

    it('deve exportar LOCKFILE_NAMES como colecao congelada', () => {
      expect(Object.isFrozen(LOCKFILE_NAMES)).toBe(true);
      expect(LOCKFILE_NAMES).toContain('package-lock.json');
      expect(LOCKFILE_NAMES).toContain('yarn.lock');
      expect(LOCKFILE_NAMES).toContain('pnpm-lock.yaml');
    });
  });

  describe('normalizePathSeparators', () => {
    it('deve converter barras invertidas do padrao Windows para barras retas', () => {
      const input = 'src\\controllers\\userController.js';
      expect(normalizePathSeparators(input)).toBe('src/controllers/userController.js');
    });

    it('deve unificar caminhos com separadores mistos', () => {
      const input = 'server\\routes/api\\v1/users.js';
      expect(normalizePathSeparators(input)).toBe('server/routes/api/v1/users.js');
    });

    it('deve eliminar barras redundantes consecutivas', () => {
      const input = 'src///components////Header//index.jsx';
      expect(normalizePathSeparators(input)).toBe('src/components/Header/index.jsx');
    });

    it('deve preservar a barra inicial em caminhos absolutos Unix', () => {
      const input = '/usr/local/project/src/index.js';
      expect(normalizePathSeparators(input)).toBe('/usr/local/project/src/index.js');
    });

    it('deve remover espacos nas extremidades da string', () => {
      const input = '   src/routes.js   ';
      expect(normalizePathSeparators(input)).toBe('src/routes.js');
    });

    it('deve retornar string vazia para entradas invalidas ou vazias', () => {
      expect(normalizePathSeparators('')).toBe('');
      expect(normalizePathSeparators('   ')).toBe('');
      expect(normalizePathSeparators(null)).toBe('');
      expect(normalizePathSeparators(undefined)).toBe('');
      expect(normalizePathSeparators(123)).toBe('');
      expect(normalizePathSeparators({})).toBe('');
    });
  });

  describe('isIgnoredDirectory', () => {
    it('deve identificar pastas ignoradas padrao', () => {
      expect(isIgnoredDirectory('node_modules')).toBe(true);
      expect(isIgnoredDirectory('dist')).toBe(true);
      expect(isIgnoredDirectory('build')).toBe(true);
      expect(isIgnoredDirectory('out')).toBe(true);
      expect(isIgnoredDirectory('.next')).toBe(true);
      expect(isIgnoredDirectory('.git')).toBe(true);
      expect(isIgnoredDirectory('.svn')).toBe(true);
      expect(isIgnoredDirectory('.hg')).toBe(true);
      expect(isIgnoredDirectory('coverage')).toBe(true);
      expect(isIgnoredDirectory('.nyc_output')).toBe(true);
      expect(isIgnoredDirectory('.cache')).toBe(true);
      expect(isIgnoredDirectory('.turbo')).toBe(true);
    });

    it('deve identificar pastas ignoradas aninhadas em caminhos relativos', () => {
      expect(isIgnoredDirectory('backend/node_modules/express')).toBe(true);
      expect(isIgnoredDirectory('frontend/dist/assets')).toBe(true);
      expect(isIgnoredDirectory('client/.next/server')).toBe(true);
      expect(isIgnoredDirectory('project/.git/objects')).toBe(true);
    });

    it('deve lidar corretamente com caminhos no formato Windows', () => {
      expect(isIgnoredDirectory('server\\node_modules\\lodash')).toBe(true);
      expect(isIgnoredDirectory('app\\dist\\bundle.js')).toBe(true);
      expect(isIgnoredDirectory('root\\.git\\hooks')).toBe(true);
    });

    it('deve ser insensivel a maiusculas e minusculas', () => {
      expect(isIgnoredDirectory('NODE_MODULES')).toBe(true);
      expect(isIgnoredDirectory('Dist')).toBe(true);
      expect(isIgnoredDirectory('Build')).toBe(true);
      expect(isIgnoredDirectory('.GIT')).toBe(true);
      expect(isIgnoredDirectory('frontend/DIST/chunks')).toBe(true);
    });

    it('deve retornar falso para pastas validas de codigo da aplicacao', () => {
      expect(isIgnoredDirectory('src')).toBe(false);
      expect(isIgnoredDirectory('src/components')).toBe(false);
      expect(isIgnoredDirectory('server/routes/api')).toBe(false);
      expect(isIgnoredDirectory('packages/core/services')).toBe(false);
      expect(isIgnoredDirectory('lib/utils')).toBe(false);
    });

    it('nao deve descartar pastas com nomes que apenas contenham palavras ignoradas como substring', () => {
      expect(isIgnoredDirectory('distribution/bundle')).toBe(false);
      expect(isIgnoredDirectory('my-district/index')).toBe(false);
      expect(isIgnoredDirectory('custom_node_modules_renamed')).toBe(false);
      expect(isIgnoredDirectory('rebuild/src')).toBe(false);
    });

    it('deve retornar falso para valores invalidos', () => {
      expect(isIgnoredDirectory('')).toBe(false);
      expect(isIgnoredDirectory(null)).toBe(false);
      expect(isIgnoredDirectory(undefined)).toBe(false);
      expect(isIgnoredDirectory(42)).toBe(false);
    });
  });

  describe('isSensitiveFile', () => {
    it('deve identificar arquivos de variaveis de ambiente sensiveis', () => {
      expect(isSensitiveFile('.env')).toBe(true);
      expect(isSensitiveFile('.env.local')).toBe(true);
      expect(isSensitiveFile('.env.development')).toBe(true);
      expect(isSensitiveFile('.env.production')).toBe(true);
      expect(isSensitiveFile('.env.test')).toBe(true);
      expect(isSensitiveFile('.env.staging')).toBe(true);
      expect(isSensitiveFile('server/.env.production')).toBe(true);
      expect(isSensitiveFile('frontend\\.env.local')).toBe(true);
    });

    it('deve permitir arquivos de template publicos (.env.example, .env.sample)', () => {
      expect(isSensitiveFile('.env.example')).toBe(false);
      expect(isSensitiveFile('.env.sample')).toBe(false);
      expect(isSensitiveFile('.env.template')).toBe(false);
      expect(isSensitiveFile('server/.env.example')).toBe(false);
    });

    it('deve identificar certificados e chaves privadas', () => {
      expect(isSensitiveFile('server.key')).toBe(true);
      expect(isSensitiveFile('cert.pem')).toBe(true);
      expect(isSensitiveFile('keystore.pfx')).toBe(true);
      expect(isSensitiveFile('auth.pkcs12')).toBe(true);
    });

    it('deve retornar falso para arquivos normais de codigo', () => {
      expect(isSensitiveFile('server.js')).toBe(false);
      expect(isSensitiveFile('environment.js')).toBe(false);
      expect(isSensitiveFile('envConfig.js')).toBe(false);
      expect(isSensitiveFile('App.jsx')).toBe(false);
    });

    it('deve retornar falso para entradas invalidas', () => {
      expect(isSensitiveFile('')).toBe(false);
      expect(isSensitiveFile(null)).toBe(false);
      expect(isSensitiveFile(undefined)).toBe(false);
    });
  });

  describe('isMinifiedFile', () => {
    it('deve identificar extensoes minificadas e bundles padrao', () => {
      expect(isMinifiedFile('vendor.min.js')).toBe(true);
      expect(isMinifiedFile('app.min.jsx')).toBe(true);
      expect(isMinifiedFile('react-dom.bundle.js')).toBe(true);
      expect(isMinifiedFile('bundle.js')).toBe(true);
      expect(isMinifiedFile('bundle.cjs')).toBe(true);
      expect(isMinifiedFile('client.min.mjs')).toBe(true);
    });

    it('deve reconhecer arquivos minificados em caminhos aninhados', () => {
      expect(isMinifiedFile('public/assets/vendor.min.js')).toBe(true);
      expect(isMinifiedFile('static\\scripts\\main.bundle.js')).toBe(true);
    });

    it('deve ser insensivel a maiusculas', () => {
      expect(isMinifiedFile('APP.MIN.JS')).toBe(true);
      expect(isMinifiedFile('BUNDLE.JS')).toBe(true);
    });

    it('deve retornar falso para arquivos regulares que contenham termos similares', () => {
      expect(isMinifiedFile('admin.js')).toBe(false);
      expect(isMinifiedFile('mindset.js')).toBe(false);
      expect(isMinifiedFile('terminal.js')).toBe(false);
      expect(isMinifiedFile('app.js')).toBe(false);
      expect(isMinifiedFile('bundle-helper.js')).toBe(false);
    });

    it('deve retornar falso para entradas invalidas', () => {
      expect(isMinifiedFile('')).toBe(false);
      expect(isMinifiedFile(null)).toBe(false);
      expect(isMinifiedFile(undefined)).toBe(false);
    });
  });

  describe('isProcessableFile', () => {
    it('deve aprovar arquivos JavaScript com extensoes permitidas', () => {
      expect(isProcessableFile('src/index.js')).toBe(true);
      expect(isProcessableFile('src/components/Button.jsx')).toBe(true);
      expect(isProcessableFile('server/routes/users.mjs')).toBe(true);
      expect(isProcessableFile('config/database.cjs')).toBe(true);
    });

    it('deve aprovar arquivos com caminhos no formato Windows', () => {
      expect(isProcessableFile('src\\services\\api.js')).toBe(true);
      expect(isProcessableFile('frontend\\src\\App.jsx')).toBe(true);
    });

    it('deve rejeitar extensoes nao elegiveis para analise sintatica', () => {
      expect(isProcessableFile('src/types/index.ts')).toBe(false);
      expect(isProcessableFile('src/types/index.d.ts')).toBe(false);
      expect(isProcessableFile('src/components/App.tsx')).toBe(false);
      expect(isProcessableFile('public/index.html')).toBe(false);
      expect(isProcessableFile('src/index.css')).toBe(false);
      expect(isProcessableFile('package.json')).toBe(false);
      expect(isProcessableFile('README.md')).toBe(false);
      expect(isProcessableFile('logo.png')).toBe(false);
      expect(isProcessableFile('LICENSE')).toBe(false);
      expect(isProcessableFile('.gitignore')).toBe(false);
    });

    it('deve rejeitar arquivos localizados dentro de pastas ignoradas', () => {
      expect(isProcessableFile('node_modules/express/index.js')).toBe(false);
      expect(isProcessableFile('frontend/dist/assets/index.js')).toBe(false);
      expect(isProcessableFile('server/build/server.js')).toBe(false);
      expect(isProcessableFile('.git/hooks/prepare-commit.js')).toBe(false);
      expect(isProcessableFile('coverage/lcov-report/index.js')).toBe(false);
      expect(isProcessableFile('.next/static/chunks/app.js')).toBe(false);
      expect(isProcessableFile('.cache/babel-loader/cache.js')).toBe(false);
    });

    it('deve rejeitar arquivos minificados e empacotados', () => {
      expect(isProcessableFile('src/vendor.min.js')).toBe(false);
      expect(isProcessableFile('src/bundle.js')).toBe(false);
      expect(isProcessableFile('public/main.bundle.js')).toBe(false);
    });

    it('deve rejeitar arquivos sensiveis e credenciais', () => {
      expect(isProcessableFile('.env')).toBe(false);
      expect(isProcessableFile('.env.local')).toBe(false);
      expect(isProcessableFile('server/.env.production')).toBe(false);
      expect(isProcessableFile('secrets/auth.pem')).toBe(false);
    });

    it('deve rejeitar manifestos de lock', () => {
      expect(isProcessableFile('package-lock.json')).toBe(false);
      expect(isProcessableFile('yarn.lock')).toBe(false);
      expect(isProcessableFile('pnpm-lock.yaml')).toBe(false);
    });

    it('deve retornar falso para valores invalidos ou vazios', () => {
      expect(isProcessableFile('')).toBe(false);
      expect(isProcessableFile('   ')).toBe(false);
      expect(isProcessableFile(null)).toBe(false);
      expect(isProcessableFile(undefined)).toBe(false);
      expect(isProcessableFile(123)).toBe(false);
      expect(isProcessableFile({})).toBe(false);
    });
  });

  describe('shouldScanPath', () => {
    it('deve aprovar caminhos navegaveis legitimos', () => {
      expect(shouldScanPath('src')).toBe(true);
      expect(shouldScanPath('src/components')).toBe(true);
      expect(shouldScanPath('server/routes/api/v1')).toBe(true);
      expect(shouldScanPath('src\\services\\userService.js')).toBe(true);
    });

    it('deve bloquear a entrada em qualquer arvore de diretorio ignorado', () => {
      expect(shouldScanPath('node_modules')).toBe(false);
      expect(shouldScanPath('client/node_modules')).toBe(false);
      expect(shouldScanPath('dist')).toBe(false);
      expect(shouldScanPath('.git')).toBe(false);
      expect(shouldScanPath('packages/app/build')).toBe(false);
      expect(shouldScanPath('root\\NODE_MODULES\\pkg')).toBe(false);
    });

    it('deve retornar falso para caminhos vazios ou invalidos', () => {
      expect(shouldScanPath('')).toBe(false);
      expect(shouldScanPath(null)).toBe(false);
      expect(shouldScanPath(undefined)).toBe(false);
    });
  });
});
