
# API local — fatia 1

Base `http://127.0.0.1:4000`. O Next encaminha `/api/*` pela mesma origem. Todas as rotas, exceto health, exigem sessão local. Escritas exigem `x-eimax-client: workspace` e origem permitida, quando enviada.

| Método / rota | Permissão | Comportamento |
| --- | --- | --- |
| GET /health | Pública | Estado local, execução real indisponível |
| GET /me | Membership válida | Empresa e papel resolvidos no servidor |
| GET /workflows | owner/editor/viewer | Lista restrita à empresa da sessão |
| POST /workflows | owner/editor | `{template: "sdr", name}` cria cópia |
| GET /workflows/:id | owner/editor/viewer | Rascunho, revisão e metadados de versões |
| PATCH /workflows/:id | owner/editor | `{revision, draft}`; conflito retorna 409 |
| POST /workflows/:id/publish | owner | `{revision}`; valida semântica, serializa publicação, snapshot imutável |
| GET /workflows/:id/versions/:number | owner/editor/viewer | Snapshot imutável, escopo por empresa |
| POST /workflows/:id/simulate | owner/editor | `{revision, lead}`; interpreta grafo e persiste logs seguros |
| GET /workflows/:id/simulations | owner/editor/viewer | Histórico deste processo |
| GET /simulations | owner/editor/viewer | Últimas 50 simulações da empresa |

Um ID pertencente a outra empresa responde 404 em todas as rotas de recurso. O schema strict recusa `organization_id` enviado no corpo; headers/query de empresa não alteram a membership. Reader não escreve/simula; editor não publica. Sessões inválidas recebem 401; ação sem permissão recebe 403; dados ou semântica inválidos recebem 400 com issues.

Rascunhos podem conter configurações incompletas. Publicação e simulação exigem um gatilho, ausência de ciclos, todos os nós alcançáveis, configurações válidas e ambas as saídas da condição. Estrutura JSON: `schemaVersion:1`, `name`, `nodes`, `edges`. Nó: id/type/name/description/position/config. Aresta: id/source/target/branch opcional true/false. Máximo de 100 nós e 200 arestas.

Nenhuma rota recebe ou executa código arbitrário. Nenhuma ação externa está habilitada. O endpoint de sessão de desenvolvimento existe no Next em `POST /api/development/session`; ele não recebe empresa/papel e não está disponível em produção.
