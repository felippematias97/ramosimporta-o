# Primeiros passos no Windows

Este guia é para o Felipe usar e testar o **Ramos Gestão** no computador.
Você **não precisa instalar Node.js, Git nem nenhuma ferramenta de programação**: o instalador é gerado
automaticamente no GitHub, a cada mudança no projeto.

---

## 1. Baixar o instalador

### Opção A — versão em teste (de um Pull Request ou da última mudança)

1. Entre no GitHub com a sua conta e abra o repositório **felippematias97/ramosimporta-o**.
2. Clique na aba **Actions** (no alto da página).
3. Na lista da esquerda, clique em **Instalador Windows**.
4. Clique na execução mais recente que tenha o **✓ verde**.
5. Role até o fim da página, na seção **Artifacts**, e clique em **Ramos-Gestao-Windows**.
   Vai baixar um arquivo `.zip`.
6. Abra o `.zip` (clique com o botão direito → **Extrair tudo…**). Dentro há dois arquivos:
   - `Ramos-Gestao-Instalador-0.1.0.exe` — instala o app (recomendado);
   - `Ramos-Gestao-Portatil-0.1.0.exe` — roda **sem instalar** (use se o computador da empresa bloquear instalações).

> O arquivo da seção Artifacts fica disponível por 30 dias. Depois disso, é só pegar o de uma execução mais nova.

### Opção B — versão oficial (Releases)

Quando uma versão for "fechada" (com uma etiqueta como `v0.1.0`), ela aparece em
**Releases** (na coluna da direita da página do repositório). Baixe o arquivo `Ramos-Gestao-Instalador-….exe`.

---

## 2. Instalar

1. Dê dois cliques em `Ramos-Gestao-Instalador-0.1.0.exe`.
2. **Aviso do Windows (SmartScreen):** vai aparecer uma tela azul dizendo
   *"O Windows protegeu o computador"*. Isso acontece porque o instalador **ainda não tem assinatura digital**
   (um certificado pago). Não é vírus: o arquivo foi gerado pelo próprio GitHub a partir do código do projeto.
   Para continuar: clique em **Mais informações** → **Executar assim mesmo**.
3. Siga o instalador (Avançar → Instalar). Ele instala **só para o seu usuário** e **não pede senha de administrador**.
4. Ao terminar, aparece o atalho **Ramos Gestão** na área de trabalho.

Se a empresa bloquear a instalação, use o `Ramos-Gestao-Portatil-0.1.0.exe`: copie para a pasta **Documentos**
e abra com dois cliques (o SmartScreen pode aparecer do mesmo jeito).

> Onde ficam os dados: o banco de dados fica na pasta do seu usuário do Windows
> (`%APPDATA%\Ramos Gestão`), **criptografado**. Ele nunca fica dentro da pasta da nuvem — para a nuvem vão só os backups.

---

## 3. Primeiro uso: criar a senha e guardar o código

1. Abra o app. Aparece **Bem-vindo**.
2. Digite seu nome e crie uma **senha** (mínimo 8 caracteres). Repita a senha. Clique em **Criar acesso**.
3. O app mostra o **código de recuperação** (25 letras e números, ex.: `7K2QM-…`).
   - Ele aparece **uma única vez**. Clique em **Imprimir** (ou anote à mão) e guarde em lugar seguro, longe do computador.
   - Com esse código você entra se esquecer a senha, e abre os backups em outro computador.
4. Marque "Imprimi ou anotei o código…" e clique em **Continuar**.

**Testar:** clique em **Sair** (no menu, embaixo). Entre com uma senha errada → deve aparecer *"Senha incorreta."*.
Entre com a senha certa → abre o app.

**Testar o código:** na tela de entrar, clique em *"Esqueci a senha: entrar com o código de recuperação"*,
digite o código e crie uma nova senha. Deve entrar normalmente. (Depois, se quiser, troque de volta em **Backup → Trocar senha**.)

---

## 4. Testar cada tela

O menu da esquerda tem: **Produtos**, **Custo e preço**, **Parâmetros** e **Backup**.
Embaixo fica o botão azul **Atualizar** e a última cotação do dólar (USD) e do yuan (CNY).

### 4.1 Atualizar (câmbio)

1. Com internet, clique em **Atualizar**.
2. Deve aparecer: *"USD: PTAX de dd/mm/aaaa baixada"* e o mesmo para CNY (cotação de venda do Banco Central).
3. Desligue o Wi-Fi e clique de novo: deve aparecer *"não foi possível baixar (sem conexão com a internet). Usando a última salva…"*.
   O app continua funcionando normalmente sem internet.

### 4.2 Parâmetros

**Aba "Fiscais e de mercado"**

1. Você vê os grupos: Tributos de importação (RTS), IOF, cada canal (Mercado Livre, Shopee, Amazon), Custos de venda, MEI e Anatel.
2. Os valores que vieram da especificação estão com o selo **a confirmar** (ex.: II de 60%). Os que a especificação
   não define (ICMS, IOF, taxas dos canais, embalagem, DAS…) estão em **0** e também "a confirmar": **preencha com o Contábil**.
3. Para mudar um valor: clique na linha → **Novo valor** → escolha a **data de início da vigência** → **Salvar novo valor**.
   O valor antigo fica no histórico.
4. **Testar a vigência:**
   - Clique em *Imposto de Importação (II)*, digite `50`, vigência `01/01/2030`, salve.
   - No alto, em *"Mostrar os valores vigentes em"*, escolha uma data de 2030: o II aparece **50%**.
   - Volte para a data de hoje: o II aparece **60%**.
   - Depois, abra o II de novo e clique em **Excluir** na linha de 2030 (para apagar o teste).
5. Em **MEI → CNAEs do MEI** está a lista de CNAEs (um por linha). Ela é usada no checklist dos produtos.

**Aba "Agentes e rotas de frete"**

1. Aparece o agente **HUBBUY** com as rotas EUB-E-2kg, EMS-BR-T, SH-SAL-BR, POST-SAL 0–30KG e HZ-SAL.
   As tarifas estão **em branco (zero)** e "a confirmar": o app não inventa preço de frete.
2. Clique em **Tarifas** numa rota e preencha com a tabela do HUBBUY:
   - **Primeiro peso + adicional**: ex.: primeiros 500 g por ¥ 90,00 e cada 500 g a mais por ¥ 30,00 (bloco começado é cobrado inteiro);
   - ou **Faixas de peso**: até X g, valor fixo e/ou valor por kg.
   - Tem também taxa fixa, peso máximo, moeda e **data de vigência** (quando o agente mudar a tabela, cadastre uma nova com a nova data).
3. Em **Editar agente**: taxa de serviço (%) e o limite por remessa (US$ 120, a confirmar).
4. **Testar a trava:** clique em **Nova rota** e tente criar `ANJUN-BR-D` → deve aparecer que a rota não deve ser usada.

**Aba "Câmbio"**

Lista as cotações salvas. Se precisar, cadastre uma cotação manual (moeda, data, valor).

### 4.3 Produtos

1. Clique em **Novo produto**. Preencha nome, links (1688, Alibaba, agente), fornecedor, NCM, peso, medidas,
   **CNAE da categoria**, público-alvo e marca. Clique em **Salvar**.
2. Embaixo aparecem **Status**, o **Checklist de travas** e o **Histórico**.
3. **Testar a trava:** clique em **Aprovado** → deve aparecer *"O produto não pode ficar 'aprovado' com pendências…"*.
4. Confira cada item do checklist e clique em **Conferido** (ou **Não se aplica**, quando existir essa opção).
   Cada marcação registra **quem** e **quando** (aparece embaixo do item e no Histórico).
5. Com tudo resolvido, clique em **Aprovado** → o status muda.
6. **Testar a Anatel:** volte o produto para **Candidato**, marque *"Tem rádio, Bluetooth ou Wi-Fi"* e salve.
   O item Anatel fica **Bloqueado** e o produto não pode ser aprovado (regra do 1º semestre).
   Quando houver homologação própria, isso se libera em **Parâmetros → Anatel** (com data de vigência).
7. **Testar o CNAE:** se o CNAE do produto não estiver na lista do MEI, o item CNAE fica bloqueado.

### 4.4 Custo e preço

A tela mostra os **2 cenários lado a lado** (via agente e compra direta), o custo por unidade e o
**preço mínimo** em Mercado Livre, Shopee e Amazon.

1. Escolha o produto (opcional — puxa o peso), a **data de referência** (usa os parâmetros, tarifas e câmbio vigentes nessa data),
   a quantidade do lote, a moeda e o preço de 1 unidade, o frete interno na China e os pesos.
2. **Cenário 1 (via agente):** escolha o agente e a rota (o frete é calculado pela tarifa da rota).
3. **Cenário 2 (compra direta):** informe o valor do frete cobrado pelo fornecedor (ou escolha uma rota).
4. Veja a tabela de cada cenário: produto, frete interno, taxa do agente, frete internacional, IOF, II, ICMS e outros —
   no total do lote e por unidade.
5. Embaixo, **Preço mínimo por canal**. Clique em "ver composição" para ver de onde vem cada centavo.
6. Os avisos em amarelo mostram o que falta (ex.: rota sem preço) e quais parâmetros ainda estão "a confirmar".
   Se o valor da remessa passar do teto do RTS ou do limite do agente, o app **avisa** — e **nunca sugere dividir o pedido**.
7. Dê um nome e clique em **Salvar simulação** para guardar; depois é só clicar em **Abrir**.

**Conferir uma conta conhecida (opcional):** cadastre estes valores de teste em Parâmetros, todos com vigência **01/01/2030**
(assim não mexem nos valores de hoje): ICMS de importação `17`, IOF no pagamento da compra direta `3,5`,
Mercado Livre comissão `12`, Provisão de devoluções `2`, Embalagem `2,00`. Depois, em Custo e preço:
data `01/01/2030`, quantidade `10`, moeda **Real**, preço de 1 unidade `15,00`, frete interno `7,50`;
no Cenário 2: frete **Informar o valor**, moeda **Real**, `112,50`, outros custos `15,00`. O Cenário 2 deve mostrar:

| Item | Lote | Por unidade |
|---|---|---|
| Produto | R$ 150,00 | R$ 15,00 |
| Frete interno | R$ 7,50 | R$ 0,75 |
| Frete internacional | R$ 112,50 | R$ 11,25 |
| IOF (3,5%) | R$ 9,45 | R$ 0,95 |
| II (60%) | R$ 162,00 | R$ 16,20 |
| ICMS (17%, por dentro) | R$ 88,48 | R$ 8,85 |
| Outros | R$ 15,00 | R$ 1,50 |
| **Custo total** | **R$ 544,93** | **R$ 54,50** |

Preço mínimo no Cenário 2: **Mercado Livre R$ 65,69**, Shopee R$ 57,65 e Amazon R$ 57,65.
No fim, apague os valores de 2030 (abra cada parâmetro e clique em **Excluir** na linha de 2030).

> A lógica de custo foi montada pela especificação (CLAUDE.md). Quando a sua planilha de custo for colocada em `docs/`,
> ela será conferida linha a linha com o app.

### 4.5 Backup

1. Clique em **Escolher pasta…** e escolha (ou crie) uma pasta **dentro do OneDrive ou do Google Drive**,
   por exemplo `OneDrive\Ramos Backup`. O app já faz o primeiro backup.
2. Cada backup tem **2 arquivos** com a data no nome:
   `ramos-backup-2026-10-28_14-30-05.db` (banco criptografado) e `ramos-backup-2026-10-28_14-30-05.chaves.json`
   (a chave, protegida pela senha e pelo código). Os dois precisam ficar juntos.
3. **Automático:** ao entrar (se passou 1 dia), a cada 24 horas com o app aberto e ao fechar o app (se algo mudou).
   Em **Manter os últimos** você escolhe quantos guardar (padrão: 30); os mais antigos são apagados.
4. **Fazer backup agora** faz um na hora.
5. **Restaurar backup…** — escolha o arquivo `.db`, digite a senha **daquele backup** (ou o código de recuperação) e confirme.
   Antes de trocar, o app faz um backup do estado atual e guarda uma cópia na pasta de dados (`antes-da-restauracao`).

**Computador novo:** instale o app e, na tela **Bem-vindo**, clique em
*"Já uso o app em outro computador: restaurar um backup"*. Escolha o último `.db` da pasta da nuvem e digite a senha (ou o código).

**Trocar senha** e **Gerar novo código de recuperação** ficam no fim da tela Backup.
Os backups antigos continuam abrindo com a senha (e o código) que valiam quando foram feitos.

---

## 5. Logo e ícone

O logo **Ramos** está em texto, provisório, e o app usa o ícone padrão. Quando você enviar os arquivos
da marca (`assets/marca/`, com o `ramos-simbolo-app-icon.svg`), eles entram no app e no instalador.

## Dicas

- Não guarde senhas, chaves de API nem o banco de dados no GitHub (o `.gitignore` já bloqueia).
- Guarde o código de recuperação impresso. Sem a senha **e** sem o código, ninguém abre o banco — nem os backups.
- Algo deu errado? Conte no Claude Code o que aconteceu (com um print, se puder).
