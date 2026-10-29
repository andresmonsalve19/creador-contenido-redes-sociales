import path from 'node:path';
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Regla de arquitectura: un archivo dentro de <app>/src/modules/<x>/ solo puede importar de su
 * propio módulo o de shared/. Nunca de otro módulo ni de core/ (core registra los módulos, no al revés).
 * Resuelve la ruta real del import, así que detecta tanto '../reels/x' como rutas más largas.
 */
const moduleBoundaries = {
  meta: {
    type: 'problem',
    messages: {
      otherModule:
        'El módulo "{{from}}" no puede importar del módulo "{{to}}". Mueve el código común a shared/.',
      core: 'El módulo "{{from}}" no puede depender de core/. Usa shared/ o recibe lo necesario por props.',
    },
  },
  create(context) {
    const file = context.filename.replaceAll('\\', '/');
    const match = /^(.*\/src)\/modules\/([^/]+)\//.exec(file);
    if (!match) return {};
    const [, srcRoot, ownModule] = match;

    const check = (node) => {
      const source = node.source?.value;
      if (typeof source !== 'string' || !source.startsWith('.')) return;
      // join + normalize (no resolve) para no mezclar rutas de Windows con el cwd.
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), source));
      if (!target.startsWith(`${srcRoot}/`)) return;
      const [area, name] = target.slice(srcRoot.length + 1).split('/');
      if (area === 'core') {
        context.report({ node: node.source, messageId: 'core', data: { from: ownModule } });
      } else if (area === 'modules' && name && name !== ownModule) {
        context.report({
          node: node.source,
          messageId: 'otherModule',
          data: { from: ownModule, to: name },
        });
      }
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    };
  },
};

export default tseslint.config(
  { ignores: ['**/dist', '**/node_modules', 'server/data', 'server/build', '.agents', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['server/**/*.ts', 'server/scripts/**/*.mjs', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowExportNames: ['default'] }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { architecture: { rules: { 'module-boundaries': moduleBoundaries } } },
    rules: {
      'architecture/module-boundaries': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
