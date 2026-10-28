# Primeiros passos no Windows

## 1. Instalar as ferramentas (uma vez)

1. **Claude desktop app** — https://claude.ai/download. Entre com sua conta; o desenvolvimento acontece na aba **Code**.
2. **Node.js (versão LTS)** — https://nodejs.org. Instale com as opções padrão.
3. **Git** — https://git-scm.com/download/win. Instale com as opções padrão.

Para conferir: abra o **Prompt de Comando** e digite `node -v` e depois `git --version`. Os dois devem mostrar um número de versão.

## 2. Baixar o projeto

1. Crie uma pasta, por exemplo `Documentos\ramos-gestao`.
2. Abra o Claude desktop app, aba **Code**, e selecione essa pasta.
3. Peça: "Clone o repositório felippematias97/ramosimporta-o nesta pasta e leia o CLAUDE.md."
   Na primeira vez, o Git pode abrir uma janela pedindo login no GitHub: entre com sua conta.

## 3. Começar a etapa 1

Peça no Claude Code: "Vamos começar a Etapa 1 do CLAUDE.md."
Ao fim de cada etapa, ele explica como abrir e testar o app.

## Dicas

- Não guarde senhas, chaves de API ou o banco de dados no GitHub (o `.gitignore` já bloqueia).
- Se algo der errado, peça ao Claude Code para voltar à última versão que funcionava: o Git guarda todo o histórico.
