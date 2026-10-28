# Ramos Gestão

Plataforma interna de gestão da Ramos Importação e Comércio: app desktop (Windows e Mac), offline,
com produtos, custo de importação e preço, compras, estoque, vendas, financeiro, contábil (MEI),
indicadores e IA.

- Especificação completa: [CLAUDE.md](CLAUDE.md)
- Como baixar, instalar e testar no Windows: [docs/primeiros-passos-windows.md](docs/primeiros-passos-windows.md)

Repositório privado. Uso interno.

## Situação

**Etapa 1 (base):** login local com banco criptografado, backup, Parâmetros com vigência, Produtos com checklist
de travas e Custo e preço (2 cenários + preço mínimo por canal). Instalador do Windows gerado pelo GitHub Actions.

## Para quem desenvolve

Stack: Electron + React + TypeScript + Vite (electron-vite), SQLite criptografado (better-sqlite3-multiple-ciphers),
Vitest. Node 22.

```bash
npm ci            # instalar
npm test          # testes (regras de cálculo, cofre de chaves, banco, backup)
npm run typecheck # conferir tipos
npm run dev       # abrir o app em modo desenvolvimento
npm run dist:win  # gerar o instalador do Windows (o CI faz isso no workflow "Instalador Windows")
```

Organização do código:

| Pasta | O que tem |
|---|---|
| `src/shared/` | Regras puras, testadas: dinheiro em centavos, vigência, frete por rota, custo de importação, rateio, preço mínimo, checklist de produtos, câmbio PTAX, simulação |
| `src/main/` | Processo principal do Electron: cofre de chaves (argon2id + AES-GCM), banco e migrações, repositórios, backup, serviço exposto à interface |
| `src/preload/` | Ponte segura entre interface e processo principal |
| `src/renderer/` | Interface React (telas de acesso, Produtos, Custo e preço, Parâmetros, Backup) |

Segurança dos dados: o banco é criptografado com uma chave aleatória de 32 bytes. Essa chave fica no arquivo
`ramos.chaves.json` embrulhada (AES-256-GCM) duas vezes: por uma chave derivada da senha (argon2id) e por uma
derivada do código de recuperação. Backup = `VACUUM INTO` (cópia consistente e já criptografada) + o arquivo de chaves.

Migrações ficam em `src/main/migracoes.ts`: nunca altere uma migração já publicada; crie uma nova no fim da lista.
