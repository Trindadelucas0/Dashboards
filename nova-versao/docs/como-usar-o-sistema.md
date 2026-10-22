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

Para importação fiscal, exclusão de arquivos, DRE, Balancete, Impostos, Memória e particularidades por empresa, consulte a seção **8. Como usar o sistema** da documentação oficial.
