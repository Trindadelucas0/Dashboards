# Como usar o sistema

Guia rápido do Dashboards Êxito. A fonte oficial de regras e contratos técnicos é [`DOCUMENTACAO-SISTEMA.md`](../DOCUMENTACAO-SISTEMA.md).

## Conciliação bancária

### Importar um banco e mês

1. Entre como administrador e abra a empresa correta.
2. Se houver filiais, escolha uma unidade específica; **Todas as unidades** não é aceita na conciliação.
3. Acesse **Financeiro → Recebimentos/Pagamentos**.
4. Clique em **Importar planilha** e selecione um arquivo `.xlsx` com um banco e uma competência.
5. Clique em **Validar e gerar prévia**.
6. Confira banco, competência, lançamentos, entradas, saídas, saldo e itens sem classificação.
7. Clique em **Gravar importação**.

Empresas antigas que possuem apenas o cadastro principal podem usar normalmente a unidade **Matriz**; não é necessário recadastrar o CNPJ para abrir esta tela.

O sistema usa somente: Data, Débito, Crédito, Valor, Histórico, Nº Nota e Classificação Êxito. Situação, Verificação do cliente, Observação e qualquer coluna posterior não são importadas.

### Substituir um banco e mês

Quando já existe a mesma empresa, unidade, banco e competência, a prévia avisa sobre a substituição. Marque **Substituir banco/mês existente** e confirme. A versão anterior deixa de aparecer nas consultas, mas permanece registrada como histórico.

O mesmo arquivo já ativo é recusado como duplicado.

### Consultar lançamentos

1. Escolha **Banco** e **Competência** nos seletores da própria tela.
2. Confira Entradas, Saídas, Saldo e Lançamentos.
3. Clique em uma linha de **Classificação Êxito** para aplicar ou remover o filtro.
4. Use a busca por histórico ou número da nota, o filtro de classificação e o intervalo de datas.
5. Navegue com **Anterior** e **Próxima**.

Usuários autorizados consultam; somente administradores importam e substituem.

### Erros que impedem a importação

- arquivo diferente de `.xlsx`, vazio, inválido ou maior que 10 MB;
- mais de uma aba;
- banco ou competência ausentes no cabeçalho;
- ausência das sete colunas esperadas;
- data ou valor ilegível;
- lançamento fora do mês informado no cabeçalho.

Classificação Êxito vazia não impede a gravação: o lançamento aparece como **Sem classificação**.

## Outras rotinas

### Exportar entradas e saídas com o Nº da Nota

1. Abra a empresa e escolha um mês, trimestre ou **Todas as unidades**.
2. Para entradas, acesse **Finalidade de Compras** e clique em **Exportar Excel**. Consulte a aba **Fornecedores**.
3. Para saídas, acesse **Vendas** e clique em **Exportar Excel**. Consulte a aba **Clientes**.
4. Confira competência, unidade, Nº da Nota, série, CFOP, fornecedor/cliente, documento, UF e valor.

Quando uma nota possuir mais de um CFOP, ela aparece uma vez para cada CFOP. Se a planilha importada não informar o número ou a série, o Excel mostra `—`. Os botões de PDF e o relatório **Por Fornecedor** mantêm o formato anterior.

### Renomear uma empresa e cadastrar vários CNPJs no mesmo dashboard

Somente administradores podem cadastrar ou renomear unidades.

1. No seletor, clique em **Nova empresa** e informe o nome e o CNPJ principal.
2. Em **Outros CNPJs**, clique em **Adicionar outro CNPJ**.
3. Informe um nome próprio e o CNPJ de cada unidade; nomes e CNPJs não podem se repetir.
4. Depois de cadastrar, abra o dashboard e escolha a unidade no seletor superior. O nome e o CNPJ exibidos devem acompanhar a seleção.
5. Em **Todas as unidades**, confira a indicação **CNPJs consolidados**; nenhum CNPJ individual representa esse total.
6. Para fazer o manejo depois, volte ao seletor, abra os **três pontos** e escolha **Gerenciar empresa, unidades e CNPJs**.
7. Para trocar o nome principal, edite **Empresa principal** e clique em **Salvar nome da empresa**. O CNPJ e o identificador interno permanecem iguais.
8. Use **Adicionar outro CNPJ** para uma unidade nova. Nas existentes, altere nome/CNPJ e clique em **Salvar unidade**, ou use **Remover**.

Somente administrador vê essas ações e tem permissão na API. A empresa principal pode ser renomeada, mas seu CNPJ não pode ser alterado por esse painel. Unidade que já possui planilhas, competências ou lançamentos bancários pode ser renomeada, mas não permite trocar o CNPJ nem excluir; isso protege o histórico associado à chave interna.

### Excluir uma empresa e todas as planilhas

Somente administradores podem executar esta ação.

1. Abra o seletor de dashboards.
2. No canto superior do card da empresa, abra o menu de **três pontos**.
3. Clique em **Excluir empresa**.
4. Confira o nome e o aviso de que a ação não pode ser desfeita.
5. Clique em **Confirmar exclusão**. Para desistir, use **Cancelar**.

A empresa sai do seletor junto com planilhas fiscais e bancárias, meses, notas, CNPJs/unidades e vínculos de acesso. As contas de usuário permanecem cadastradas, mas sem acesso à empresa excluída. A operação não possui lixeira ou restauração pela tela; recuperação exige backup do banco. Usuários comuns não veem a opção e não têm permissão na API.

### Importar e corrigir planilhas fiscais

1. Abra a empresa correta e acesse **Importar**.
2. Confirme que o nome da planilha padrão contém a competência em `MMYYYY` (ex.: `Planilha Padrao 102026.xlsx`). O texto `5005-2012` da aba de ICMS não representa o mês.
3. Selecione as planilhas e use **Extrair e validar**.
4. Confira empresa, competência, unidade e tipo em cada linha da prévia. Um recorte com `ICMS 5005-2012` + `ST` deve mostrar os dois tipos.
   As abas `PIS COFINS` e `PIS E COFINS` devem aparecer como `pis_cofins`.
5. Use **Gravar** para mesclar dados novos ao mês.
6. Use **Substituir tipos enviados** quando estiver corrigindo uma planilha já importada. Somente os tipos exibidos na prévia serão trocados; movimento, impostos, DRE ou Balancete de outras planilhas do mesmo mês permanecem.
7. Confira o mês nas abas Visão Geral, Compras, Vendas, Impostos, Memória, DRE e Balancete conforme os tipos importados.

Não use a substituição para acrescentar um tipo ausente: nesse caso, **Gravar** é suficiente.

### Importar o Simples Nacional das filiais 44, 45, 56 e 67

Este fluxo é exclusivo para **44-DAUTO SERVIÇOS-MG**, **45-VET LUZIÂNIA-GO**, **56-ÉTICA-DF** e **67-MERCADO ÁGUAS CLARAS-DF**.

1. Abra o dashboard da empresa à qual a filial pertence e acesse **Importar**.
2. Selecione o relatório `Simples Nacional.xls` e clique em **Extrair e validar**.
3. Confira na prévia: filial/estabelecimento, competência, RPA, alíquota e DAS. O CNPJ precisa estar cadastrado na mesma empresa e apontar para uma das quatro unidades permitidas.
4. Na primeira carga, clique em **Gravar**. Para corrigir o Simples já importado naquele mês, use **Substituir tipos enviados**; movimento, DRE, Balancete e outros impostos permanecem.
5. Em **Memória de Cálculo**, confira RPA, RBT12, RBA, enquadramento, DAS e partilha. Use **Ver memória técnica** para mercados interno/externo e ajustes.
6. Em **Impostos**, confira **RPA do Simples**, total do DAS e **DAS / RPA**.

O sistema bloqueia competência ausente, empresa/CNPJ divergentes, estabelecimento fora da lista, fórmula do DAS incompatível ou partilha que não fecha. A filial 44 está calibrada com setembro/2026; na primeira planilha das filiais 45, 56 e 67, revise todos os números da prévia antes de gravar.

### Consultar a DRE detalhada

1. Abra a empresa e acesse **Financeiro → DRE**.
2. Escolha a competência no seletor superior.
3. Clique no nome ou no chevron de um grupo ou subtotal para mostrar ou ocultar suas contas.
4. Use **Expandir** para abrir todos os níveis ou **Recolher** para voltar ao estado inicial: grupos abertos e subtotais fechados.

Resultados como Receita Líquida, Lucro Bruto e Lucro Líquido permanecem sempre visíveis. Ao abrir **Despesas Administrativas**, aparecem linhas como Salários e Ordenados, INSS, FGTS, Taxas Diversas, IPTU, Energia Elétrica, Água e Esgoto, Seguros, Honorários Contábeis e Serviços Prestados por Terceiros. **Bonificações Concedidas** e **Eventos e Confraternizações** aparecem dentro de **Outras Despesas Operacionais** quando essa for a posição delas na planilha. No trimestre, uma conta que não exista em determinado mês mostra `—`, mas permanece no subtotal correto; Média e Acumulado consideram somente os meses que possuem valor. Meses importados antes desta correção também recebem a árvore, sem nova importação e sem alteração dos valores gravados.

### Consultar o Balancete por período

1. Abra a empresa e acesse **Financeiro → Balancete**.
2. Escolha um mês no seletor superior para ver somente aquela competência.
3. Escolha um trimestre para comparar somente os meses importados daquele trimestre.
4. Clique em **Geral**, dentro do card **Balancete de Verificação**, para ver todos os meses importados do ano consultado. Clique novamente para voltar ao período selecionado.

Quando houver mais de um mês visível, a coluna TOTAL soma somente essas colunas. Se o mês ou trimestre escolhido não tiver Balancete importado, a tela informa a ausência e não mostra dados de outro período. Essa regra não altera o **Balanço Patrimonial** da Indústria Schumacher.

### Publicar uma atualização em produção

1. Integre a alteração na branch `main` do repositório `Dashboards`.
2. Abra **GitHub → Actions → Deploy** e acompanhe o job **Deploy no servidor**.
3. Considere a publicação concluída somente quando o job terminar em verde; o próprio deploy valida a API e a aplicação web.

Ao iniciar depois de um deploy, a API cria de forma idempotente qualquer tabela modelada que ainda esteja ausente. Assim, telas com persistência própria, como **Recebimentos/Pagamentos**, não ficam disponíveis antes do respectivo schema do PostgreSQL.

Se o job permanecer em **Waiting for a runner**, confira na VPS o serviço do runner exclusivo `exito-vps-Dashboards`. Não coloque senha, token de registro ou chave SSH em commits, documentação ou logs do chamado.

Para importação fiscal, exclusão de arquivos, DRE, Balancete, Impostos, Memória e particularidades por empresa, consulte a seção **8. Como usar o sistema** da documentação oficial.
