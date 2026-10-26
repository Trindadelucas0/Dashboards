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

### Consultar a DRE detalhada

1. Abra a empresa e acesse **Financeiro → DRE**.
2. Escolha a competência no seletor superior.
3. Clique no nome ou no chevron de um grupo ou subtotal para mostrar ou ocultar suas contas.
4. Use **Expandir** para abrir todos os níveis ou **Recolher** para voltar ao estado inicial: grupos abertos e subtotais fechados.

Resultados como Receita Líquida, Lucro Bruto e Lucro Líquido permanecem sempre visíveis. Ao abrir **Despesas Administrativas**, aparecem linhas como Salários e Ordenados, INSS, FGTS, Energia Elétrica, Água e Esgoto, Seguros, Honorários Contábeis e Serviços Prestados por Terceiros. Meses importados antes desta correção também recebem a árvore, sem nova importação.

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

Se o job permanecer em **Waiting for a runner**, confira na VPS o serviço do runner exclusivo `exito-vps-Dashboards`. Não coloque senha, token de registro ou chave SSH em commits, documentação ou logs do chamado.

Para importação fiscal, exclusão de arquivos, DRE, Balancete, Impostos, Memória e particularidades por empresa, consulte a seção **8. Como usar o sistema** da documentação oficial.
