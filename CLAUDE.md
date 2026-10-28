# Ramos Gestão — especificação do app

> Leia este arquivo inteiro antes de qualquer trabalho neste repositório.
> Responda sempre em português do Brasil, de forma direta e prática.
> O dono (Felipe) não é programador: explique o que fez em linguagem simples e diga como testar.

## 1. O que é

Plataforma interna de gestão da **Ramos Importação e Comércio** (MEI a partir de jan/2027, São Paulo/SP).
A empresa importa da China (itens diversos, foco em eletrônicos e acessórios) e revende no
Mercado Livre, Shopee e Amazon. Operação 100% legal: tributos, notas fiscais e homologações em dia.

- **App desktop** para Windows e macOS (sem versão mobile), instalado na área de trabalho.
- **Offline-first**: tudo funciona sem internet. Um botão **"Atualizar"** no menu sincroniza quando houver conexão.
- **Uso interno, um único usuário** (administrador). Nada é publicado na internet.
- **Relatórios** em PDF e Excel salvos numa pasta escolhida pelo usuário.
- **Backup** automático do banco para uma pasta sincronizada na nuvem (OneDrive/Google Drive/iCloud).
- **IA** para dúvidas do dia a dia, só quando online.
- Futuro: o Bling será o hub de vendas e NF-e; este app lê do Bling e faz o que o Bling não faz bem
  (custo real de importação, margem por produto/canal, limite do MEI, contábil, IA).

## 2. Stack técnica

| Camada | Escolha |
|---|---|
| Desktop | Electron + electron-builder (instalador NSIS no Windows; DMG no Mac via GitHub Actions) |
| Interface | React + TypeScript + Vite |
| Banco | SQLite local (better-sqlite3 ou variante com criptografia, ex.: better-sqlite3-multiple-ciphers) |
| Migrações | Versionadas no código; nunca alterar migração já aplicada |
| Relatórios | PDF (gerado pelo próprio Electron/printToPDF ou pdfmake) e Excel (exceljs) |
| Testes | Vitest para regras de cálculo (custo, tributos, MEI) — obrigatórios |

Regras técnicas:
- Fontes (Bricolage Grotesque e Manrope, licença OFL) **empacotadas localmente** — o app precisa funcionar offline.
- Banco de dados fica na pasta de dados do usuário do sistema (`app.getPath('userData')`), **nunca** dentro da pasta da nuvem.
- Backup = cópia consistente do banco (API de backup do SQLite) para a pasta da nuvem, com data no nome; manter os últimos N.
- Segredos (chaves de API, token do Bling) guardados com `safeStorage` do Electron, nunca em texto puro nem no Git.
- Login local com senha do administrador (hash com argon2 ou bcrypt). Banco criptografado.
- Todo parâmetro fiscal ou de mercado (alíquotas, limites, taxas de marketplace, câmbio) é **configurável na tela de Parâmetros, com data de vigência**. Nada disso fica fixo no código.
- Valores monetários em centavos (inteiros) ou decimal seguro; nunca float para dinheiro.

## 3. Identidade visual

- Cores: preto `#111111`, branco `#FFFFFF`, azul Ramos `#1D4ED8` (destaque, com moderação),
  azul para fundo escuro `#7EA2FF`, cinza médio `#8A8A8A` (texto pequeno: `#6B6B6B`), cinza claro `#EDEDED`.
- Fontes: Bricolage Grotesque (títulos/logo), Manrope (textos).
- Visual minimalista, preto e branco. Logo e símbolo em `assets/marca/`.
- Ícone do app: `assets/marca/ramos-simbolo-app-icon.svg`.

## 4. Módulos

### 4.1 Produtos e checagens
Cadastro: nome, link (1688, Alibaba, agente), fornecedor, NCM, peso, dimensões, CNAE da categoria,
público-alvo, marca (genérico / submarca própria), status (candidato, aprovado, ativo, descontinuado).

Travas antes de aprovar um produto (checklist obrigatório, com registro de quem/quando):
- **Anatel**: no 1º semestre, só itens sem rádio/Bluetooth/Wi-Fi e sem circuito de carga
  (bloquear fone sem fio, carregador, power bank, rastreador tipo AirTag). Homologação é própria, por modelo.
- **Inmetro**: brinquedos, adaptadores de tomada, eletrodomésticos.
- **Têxteis** (inclusive roupa pet): etiqueta em português.
- **Propriedade intelectual**: sem marca, logo, design copiado ou estampa licenciada de terceiros.
  Anúncio só com "para / compatível com [marca]" e fotos próprias.
- **CNAE**: a categoria precisa estar coberta pelos CNAEs do MEI (principal 4752-1/00; secundários
  4713-0/02, 4789-0/04, 4753-9/00, 4751-2/01, 4757-1/00 — lista editável).
- **Restritos dos marketplaces**: confirmação manual de que o item não está na lista de restritos de cada canal.

### 4.2 Custo de importação e preço
- Custo unitário em **2 cenários**: (1) via agente (HUBBUY, CSSBUY etc.) e (2) compra direta (1688/Alibaba).
  Em ambos há IOF na recarga/pagamento.
- **Rotas de frete** cadastráveis por agente, com "padrão de cobrança" (primeiro peso, adicional, faixas).
  Rotas iniciais do HUBBUY: EUB-E-2kg e EMS-BR-T (eletrônicos); SH-SAL-BR, POST-SAL 0–30KG, HZ-SAL (acessórios).
  **Não incluir ANJUN-BR-D.**
- **Tributos de entrada (remessa postal no CNPJ, Regime de Tributação Simplificada — RTS)**:
  II de 60% sem dedução + ICMS de importação (pago fora do DAS); isento de IPI, PIS e Cofins.
  Alíquotas e base de cálculo configuráveis (confirmar regra vigente com o Contábil antes de usar).
- Rateio por unidade do frete internacional e dos tributos de cada remessa.
- **Preço mínimo por canal** (ML, Shopee, Amazon lado a lado), considerando:
  custo do produto + frete internacional + tributos de importação + taxa do marketplace +
  frete ao cliente + embalagem + DAS + provisão de devoluções (CDC: arrependimento em 7 dias com frete).
- Câmbio: cotação PTAX do Banco Central baixada no "Atualizar"; offline usa a última salva.

### 4.3 Compras e remessas
Fluxo: pedido na China → armazém do agente (prazo ~90 dias) → remessa → em trânsito → desembaraço → recebido.
- Remessa sempre no CNPJ, nunca CPF/Remessa Conforme para revenda.
- Teto legal de US$ 3.000 por remessa no RTS; US$ 120 é limite do agente (configurável por agente).
- **O app nunca sugere dividir um pedido para caber em limite** (risco de perda da mercadoria —
  DL 37/66, art. 105, XVI). Alertar se o usuário tentar.
- Registrar invoice, rastreio, valores pagos e documento de entrada (NF-e de entrada).

### 4.4 Estoque
Entradas por remessa (com custo rateado), saídas por venda, ajustes, giro, ponto de reposição
considerando o prazo médio China→SP, custo médio. Futuro: separação por marca (pet × genéricos).

### 4.5 Vendas
- Fase inicial: lançamento manual e importação de relatórios (CSV/Excel) de cada marketplace.
- Fase Bling: leitura de pedidos e NF-e via API do Bling (v3, OAuth2) no botão "Atualizar".
  Confirmar o plano do Bling que libera a API antes de implementar.
- Margem real por venda, produto e canal.

### 4.6 Financeiro
- Caixa, contas a pagar e a receber, repasses dos marketplaces.
- **Orçamento do capital inicial (R$ 5.000), aprovado em 28/10/2026**, com gasto × limite por categoria:
  lote de teste R$ 2.000 · reposição dos vencedores R$ 1.000 · reserva intocável R$ 1.000 ·
  anúncios R$ 400 · embalagens e etiquetas R$ 300 · custos fixos até o 1º repasse R$ 300.
- Reinvestimento total nos primeiros 6 meses (sem retiradas) — registrar retiradas separadamente quando houver.

### 4.7 Contábil e fiscal (MEI)
- Livro caixa; plano de contas simples (preparado para a migração para ME).
- Registro de NF-e de entrada e saída.
- **Relatório Mensal de Receitas Brutas** do MEI (gerar todo mês).
- Dados para a **DASN-SIMEI** anual.
- Controle do DAS mensal (vencimento, pago).
- A partir de 2028: controle compras × receitas (regra dos 80%, LC 123, art. 29, X).

### 4.8 Painel do MEI (limite de faturamento)
Gestão pela **receita bruta**. Parâmetros (editáveis, com vigência):
- 2027: R$ 110.000/ano; 2028: R$ 140.000/ano.
- Ano de abertura: R$ 9.166,67 × meses entre a abertura e dezembro (fração de mês conta como mês cheio).
Alertas:
1. Média mensal acima de R$ 9.166,67.
2. 80% do teto acumulado.
3. Projeção anual acima do teto.
Lembrete: a migração para ME só vale a partir de 1º de janeiro; excesso acima de 20% do teto retroage ao início do ano.

### 4.9 Indicadores
Margem por produto/canal, giro, produtos vencedores, uso do capital, faturamento × limite MEI.

### 4.10 IA
- Só online. Provedor configurável: **Gemini (plano gratuito) como padrão**; reserva Groq e OpenRouter (`:free`);
  opcionais Ollama (local) e Claude.
- Se o provedor atingir o limite (HTTP 429), tentar o próximo da lista.
- A IA pode consultar dados da empresa (produtos, custos, vendas agregadas, parâmetros) para responder.
- **Nunca enviar dados pessoais de clientes** (nome, CPF, endereço, telefone) — filtrar antes de enviar (LGPD).
- Mostrar aviso de que a resposta é de IA e deve ser conferida em temas fiscais e legais.

### 4.11 Relatórios e exportação
PDF e Excel de qualquer módulo, salvos na pasta escolhida. Exportação de produtos e estoque no formato
de importação do Bling (para a migração).

## 5. Etapas de desenvolvimento

1. **Base**: estrutura Electron + React, login, banco + migrações, backup, Parâmetros, Produtos + Custo e preço.
2. Compras, remessas e estoque.
3. Financeiro, contábil e painel do MEI.
4. Integração com o Bling (na abertura, jan/2027).
5. IA e indicadores.

Cada etapa termina com o app rodando, testes de cálculo passando e instruções simples de teste para o Felipe.

## 6. Fontes de verdade

- Ficha da Empresa (Claude Doc): https://claude.ai/artifact/GJxoBjGRYimafEsJQsE4ex
- Planilha de custo por produto do Felipe (anexar em `docs/` quando disponível) — a lógica de custo deve reproduzi-la.
- Regras fiscais e de marketplace mudam: confirme o valor vigente antes de fixar qualquer parâmetro padrão.
