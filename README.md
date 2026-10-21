# rest-api-matrix-analyzer

> O código do seu projeto nunca sai do seu computador. A sua arquitetura REST, mapeada e auditada em segundos diretamente no navegador.

Uma Single Page Application (SPA) analítica e local-first desenvolvida em React + Vite + Tailwind CSS que inspeciona o código-fonte de projetos fullstack JavaScript/Node.js no navegador, extrai rotas Express e chamadas HTTP via AST (Babel), relaciona clientes e servidores e projeta uma matriz visual de cobertura REST, expondo endpoints órfãos, chamadas quebradas e inconsistências de comunicação sem qualquer custo de infraestrutura ou envio de código para servidores.

---

## Estrutura do Projeto

```text
rest-api-matrix-analyzer/
├── src/
│   ├── analyzers/
│   │   ├── client-call-analyzer.js
│   │   ├── express-route-analyzer.js
│   │   ├── issue-detector.js
│   │   ├── route-matcher.js
│   │   └── route-normalizer.js
│   ├── components/
│   │   ├── endpoint-matrix/
│   │   │   ├── EndpointMatrixTable.jsx
│   │   │   ├── MatrixCellBadge.jsx
│   │   │   └── MatrixFiltersBar.jsx
│   │   └── project-import/
│   │       ├── AuditHistoryList.jsx
│   │       └── ProjectImportCard.jsx
│   ├── hooks/
│   │   └── useProjectAnalysis.js
│   ├── pages/
│   │   └── HomePage.jsx
│   ├── parsers/
│   │   ├── ast-parser.js
│   │   ├── directory-reader.js
│   │   ├── file-filter.js
│   │   └── zip-extractor.js
│   ├── storage/
│   │   └── analysis-storage.js
│   ├── types/
│   │   └── domain-contracts.js
│   ├── workers/
│   │   └── project-analysis.worker.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── tests/
│   ├── unit/
│   │   ├── analysis-storage.test.js
│   │   ├── ast-parser.test.js
│   │   ├── audit-history-list.test.jsx
│   │   ├── client-call-analyzer.test.js
│   │   ├── directory-reader.test.js
│   │   ├── domain-contracts.test.js
│   │   ├── endpoint-matrix-table.test.jsx
│   │   ├── express-route-analyzer.test.js
│   │   ├── file-filter.test.js
│   │   ├── home-page.test.jsx
│   │   ├── issue-detector.test.js
│   │   ├── matrix-cell-badge.test.jsx
│   │   ├── matrix-filters-bar.test.jsx
│   │   ├── project-import-card.test.jsx
│   │   ├── route-matcher.test.js
│   │   ├── route-normalizer.test.js
│   │   ├── use-project-analysis.test.js
│   │   └── zip-extractor.test.js
│   ├── App.test.jsx
│   └── setup.js
├── index.html
├── package.json
├── package-lock.json
├── postcss.config.js
├── README.md
├── tailwind.config.js
└── vite.config.js
```
