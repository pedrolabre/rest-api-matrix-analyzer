# rest-api-matrix-analyzer

> O código do seu projeto nunca sai do seu computador. A sua arquitetura REST, mapeada e auditada em segundos diretamente no navegador.

Uma Single Page Application (SPA) analítica e local-first desenvolvida em React + Vite + Tailwind CSS que inspeciona o código-fonte de projetos fullstack JavaScript/Node.js no navegador, extrai rotas Express e chamadas HTTP via AST (Babel), relaciona clientes e servidores e projeta uma matriz visual de cobertura REST, expondo endpoints órfãos, chamadas quebradas e inconsistências de comunicação sem qualquer custo de infraestrutura ou envio de código para servidores.

---

## Estrutura do Projeto

```text
rest-api-matrix-analyzer/
├── src/
│   ├── parsers/
│   │   ├── directory-reader.js
│   │   └── file-filter.js
│   ├── types/
│   │   └── domain-contracts.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── tests/
│   ├── unit/
│   │   ├── directory-reader.test.js
│   │   ├── domain-contracts.test.js
│   │   └── file-filter.test.js
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
