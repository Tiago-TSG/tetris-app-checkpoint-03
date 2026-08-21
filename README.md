# 🕹️ Retro Neon Tetris — Cloud Run Arcade (Event-Driven CQRS Edition)

Uma versão moderna, estilosa e extremamente sofisticada do clássico jogo **Tetris**, projetada com visual retro-wave/neon (Synthwave) e **Sintetizador de Áudio Procedural** nativo no navegador (usando a Web Audio API).

Esta versão (Checkpoint 02) evoluiu para uma **Arquitetura Orientada a Eventos (Event-Driven) de altíssimo desempenho**, integrando **Google Cloud Pub/Sub**, **Firestore** e aplicando o padrão **CQRS (Command and Query Responsibility Segregation)** com Visão Materializada de Cache.

## 🎨 Interface do Jogo

![Tela do Jogo Tetris Neon](tetris-app.jpg)

*Visualização da interface com estilo neon synthwave, exibindo o canvas do jogo (centro), controles (esquerda), próximas peças e estatísticas (direita) com sistema de ranking integrado.*

O projeto é estruturado com um backend assíncrono em **Python (FastAPI)** que gerencia a API de pontuações de recorde persistida no Firestore. O frontend é servido de forma estática, construído em **HTML5 Canvas, CSS moderno e JavaScript Vanilla** com **UI Otimista** para respostas instantâneas e **Feedback Visual de Conquistas**.

Este aplicativo foi planejado e otimizado especificamente para rodar localmente e ser facilmente implantado de forma escalável no **Google Cloud Run (GCP)**.

---

## 🚀 Funcionalidades e Diferenciais
*   **Sintetizador de Áudio Procedural (Web Audio API):** Som clássico de arcade gerado por código diretamente na placa de som do seu computador, dispensando carregamento de arquivos externos `.wav` ou `.mp3`.
*   **Interface Assíncrona Otimista (Novo):** O frontend não trava esperando o banco de dados. Os placares são inseridos na tela instantaneamente enquanto o Pub/Sub garante a gravação no fundo.
*   **Telemetria em Tempo Real e Conquistas (Novo):** O jogo captura eventos de "Level Up", "Tetris" e "Linhas Limpas" em tempo real, desbloqueando **Badges (Troféus)** que aparecem brilhando no meio da tela e ficam gravados ao lado do seu nome no Ranking mundial.
*   **Algoritmo Bag-of-7 (Mecânica Justa):** Geração de peças igual à do Tetris oficial de campeonato, garantindo que o jogador não sofra com sequências de azar sem peças fundamentais.
*   **Sistema de Níveis Progressivo:** O nível de dificuldade aumenta a cada 10 linhas removidas, acelerando a queda das peças de forma fluida e aplicando multiplicadores à pontuação.

---

## 🏛️ Evolução Arquitetural (Fase 1, 2 e 3)

O projeto original usava armazenamento local em disco, o que é incompatível com a natureza Serverless Efêmera do Cloud Run. O sistema foi refatorado nas seguintes fases:

### Fase 1: Persistência Robusta
*   **Google Cloud Firestore:** O backend foi integrado ao banco de dados NoSQL gerenciado do Google. Todos os scores recebidos são gravados de forma permanente, resolvendo o problema de perda de dados.

### Fase 2: Event-Driven Architecture e CQRS
O sistema agora separa completamente as responsabilidades de leitura (Query) e escrita (Command).
1.  **Ingestão e Escrita (Pub/Sub):** Quando um jogador envia um placar, a API principal do FastAPI apenas publica a mensagem no tópico do **Google Cloud Pub/Sub** e responde "Sucesso" na mesma hora (absorvendo picos de tráfego).
2.  **Processamento Assíncrono (Webhook):** A fila do Pub/Sub envia a mensagem em background (via protocolo Push) para a rota interna `/api/internal/scores-worker`.
3.  **Geração do Cache Materializado (CQRS):** Após o worker gravar o score cru no Firestore, ele próprio processa o novo ranking ("Top 10") e salva um documento consolidado em `/cache/leaderboard`.
4.  **Leitura Otimizada:** Quando milhares de jogadores abrem o jogo simultaneamente, a rota `GET /api/scores` lê **apenas 1 documento estático** do Firestore (o cache), reduzindo a latência a milissegundos e eliminando o custo em nuvem de queries de ordenação massivas.

### Fase 3: Telemetria e Padrão Fan-out (Coreografia)
A arquitetura foi expandida para suportar monitoramento de eventos ao vivo durante a partida.
1.  **Emissão de Eventos (Frontend):** O `game.js` dispara pacotes silenciosos para a API sempre que o jogador sobe de nível ou faz um Tetris.
2.  **Barramento de Mensageria:** A API despacha esses eventos para um segundo tópico do Pub/Sub (`telemetry-topic`).
3.  **Coreografia Autônoma:** Um Webhook secundário (`/api/internal/telemetry-worker`) ouve a fila, atualiza os contadores globais do jogador e roda o "Motor de Regras" para conceder medalhas na coleção `achievements`, de forma totalmente desacoplada do salvamento principal de scores.

---

## 🛠️ Arquitetura do Projeto

```text
├── backend/
│   ├── main.py              # Servidor FastAPI com rotas de API, CQRS e Pub/Sub Webhook
│   ├── requirements.txt     # Dependências de bibliotecas Python
│   └── test_main.py         # Suíte de testes automatizados do backend
├── static/                  # Pasta com os ativos de frontend servidos pelo FastAPI
│   ├── css/
│   │   └── style.css        # Estilos modernos neon, grade e animações
│   ├── js/
│   │   ├── api.js           # Funções de chamada HTTP assíncronas para o Placar (UI Otimista)
│   │   └── game.js          # Lógica do jogo, renderização Canvas e sintetizador de som
│   └── index.html           # Esqueleto da página e modais do jogo
├── Dockerfile               # Instruções de montagem da imagem Docker (Cloud Run)
├── .dockerignore            # Exclusão de arquivos desnecessários na imagem Docker
├── .gitignore               # Exclusão de arquivos de versionamento e venv
└── README.md                # Esta documentação completa do projeto
```

---

## 🖥️ Como Executar Localmente (Ambiente Virtual)

Siga os passos abaixo para preparar seu ambiente Python, instalar as dependências necessárias e inicializar o jogo em seu navegador.

### Passo 1: Clonar o Repositório
Primeiro, clone o repositório para a sua máquina local e acesse a pasta do projeto:

```bash
git clone https://github.com/Tiago-TSG/tetris-app-checkpoint-02.git
cd tetris-app-checkpoint-02
```

### Passo 2: Criar o Ambiente Virtual (`venv`)
No diretório raiz do projeto, execute o comando correspondente ao seu sistema operacional para criar o ambiente virtual:

**No Linux / macOS:**
```bash
python3 -m venv venv
```

**No Windows (CMD ou PowerShell):**
```bash
python -m venv venv
```

### Passo 3: Ativar o Ambiente Virtual
Ative o ambiente virtual para que os pacotes sejam instalados isoladamente:

**No Linux / macOS:**
```bash
source venv/bin/activate
```

**No Windows (PowerShell):**
```bash
.\venv\Scripts\Activate.ps1
```

**No Windows (CMD):**
```bash
.\venv\Scripts\activate.bat
```

### Passo 4: Instalar as Dependências
Com o ambiente virtual ativado (indicado pelo prefixo `(venv)` no seu terminal), instale as dependências listadas:

```bash
pip install -r backend/requirements.txt
```

### Passo 5: Executar o Servidor FastAPI
Execute o servidor de desenvolvimento utilizando o `uvicorn`:

```bash
uvicorn backend.main:app --reload --port 8080
```
> **Nota de Fallback:** O código é resiliente. Se você rodar localmente sem as credenciais do Google Cloud ativadas, o sistema entrará no "Modo de Segurança" (Fallback), voltando a salvar e ler os placares em um arquivo JSON local, permitindo testes offline perfeitos.

### Passo 6: Jogar!
Abra seu navegador e acesse:
👉 **[http://localhost:8080](http://localhost:8080)**

---

## 🐳 Como Executar Localmente via Docker

Este projeto possui suporte a contêineres Docker, o que permite rodar toda a aplicação sem precisar instalar o Python ou pacotes de dependências na sua máquina local.

### Passo 1: Clonar o Repositório
Primeiro, clone o repositório para a sua máquina local e acesse a pasta do projeto:

```bash
git clone https://github.com/Tiago-TSG/tetris-app-checkpoint-02.git
cd tetris-app-checkpoint-02
```

### Passo 2: Construir a Imagem Docker
No diretório raiz (onde está o arquivo `Dockerfile`), construa a imagem executando:

```bash
docker build -t tetris-app-checkpoint-02 .
```

### Passo 3: Executar o Contêiner Localmente
Inicialize o contêiner mapeando a porta interna `8080` para a porta `8080` do seu computador local:

```bash
docker run -p 8080:8080 tetris-app-checkpoint-02
```

Acesse o jogo no navegador através do endereço local **`http://localhost:8080`**.

---

## ☁️ Como Fazer o Deploy no Google Cloud Run

O **Google Cloud Run** é um serviço totalmente gerenciado do GCP que executa contêineres de forma altamente escalável e cobra apenas pelo tempo de processamento utilizado.

### Pré-requisitos
1. Ter uma conta ativa no **Google Cloud Platform (GCP)**.
2. Instalar a ferramenta de linha de comando [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/gcloud).
3. Ter um projeto criado no GCP e habilitar o faturamento (Billing) e as APIs do Cloud Build e Cloud Run.
4. Clonar este repositório Git em sua máquina local e acessar o diretório do projeto:
   ```bash
   git clone https://github.com/Tiago-TSG/tetris-app-checkpoint-02.git
   cd tetris-app-checkpoint-02
   ```

### 1. Criar os Tópicos do Pub/Sub
Para a arquitetura de Mensageria e Telemetria funcionar, crie os tópicos necessários:
```bash
gcloud pubsub topics create scores-topic
gcloud pubsub topics create telemetry-topic
```

---

### Opção 1: Deploy Direto via gcloud (Recomendado)
A forma mais rápida e simples de fazer o deploy no Cloud Run é usando o build automático do GCP a partir do seu código-fonte local. O Google Cloud enviará o código, construirá o container na nuvem e fará o deploy em uma única etapa.

1.  Abra seu terminal na raiz do projeto e faça login no Google Cloud:
    ```bash
    gcloud auth login
    ```

2.  Defina o seu projeto padrão do GCP (substitua `NOME-DO-SEU-PROJETO` pelo ID correto do console):
    ```bash
    gcloud config set project NOME-DO-SEU-PROJETO
    ```

3.  Execute o comando de deploy. Ele criará a imagem e a colocará em execução:
    ```bash
    gcloud run deploy tetris-app-checkpoint-02 \
      --source . \
      --region us-central1 \
      --allow-unauthenticated
    ```
    
    > **📝 Nota:** Por padrão, o gcloud criará automaticamente um repositório no **Artifact Registry** com o nome `cloud-run-source-deploy` para armazenar a imagem Docker construída. Você pode visualizá-lo no console do GCP em **Artifact Registry > Repositories**.
    
    *(Você pode alterar a região se desejar, como `southamerica-east1` para o Brasil).*

4.  Ao final do processo, a CLI do gcloud exibirá a **URL pública do jogo** (ex: `https://tetris-app-checkpoint-02-xxxxx-us-central1.run.app`) no serviço "Cloud Run".

### 2. Configurar as Assinaturas de Push (Webhooks)
Para fechar o ciclo do Pub/Sub, vincule os tópicos criados aos Webhooks da sua aplicação, substituindo a URL abaixo pela URL gerada no passo anterior:

**Assinatura de Scores e Cache:**
```bash
gcloud pubsub subscriptions create scores-topic-sub \
  --topic=scores-topic \
  --push-endpoint=https://SUA_URL_DO_CLOUD_RUN.a.run.app/api/internal/scores-worker \
  --ack-deadline=10
```

**Assinatura de Telemetria e Badges:**
```bash
gcloud pubsub subscriptions create telemetry-topic-sub \
  --topic=telemetry-topic \
  --push-endpoint=https://SUA_URL_DO_CLOUD_RUN.a.run.app/api/internal/telemetry-worker \
  --ack-deadline=10
```

---

### Opção 2: Deploy em Duas Etapas (Via Artifact Registry)
Se você preferir construir a imagem manualmente e enviá-la para um repositório de contêineres próprio do GCP antes de realizar o deploy:

1.  **Criar um repositório no Artifact Registry (caso não possua):**
    ```bash
    gcloud artifacts repositories create neon-arcade-repo \
      --repository-format=docker \
      --location=us-central1 \
      --description="Repositorio para o jogo Tetris"
    ```

2.  **Construir a imagem e enviá-la para o GCP via Cloud Build:**
    Substitua `PROJECT_ID` pelo ID real do seu projeto.
    ```bash
    gcloud builds submit --tag us-central1-docker.pkg.dev/PROJECT_ID/neon-arcade-repo/tetris-app-checkpoint-02:latest .
    ```

3.  **Realizar o deploy do container armazenado no registro para o Cloud Run:**
    ```bash
    gcloud run deploy retro-neon-tetris \
      --image us-central1-docker.pkg.dev/PROJECT_ID/neon-arcade-repo/tetris-app-checkpoint-02:latest \
      --region us-central1 \
      --allow-unauthenticated
    ```

*(Lembre-se de configurar as Assinaturas de Push descritas acima após este tipo de deploy também).*

---

## 🎮 Controles do Jogo
*   **Seta para Esquerda (`←`) ou `A`:** Move a peça para a esquerda.
*   **Seta para Direita (`→`) ou `D`:** Move a peça para a direita.
*   **Seta para Baixo (`↓`) ou `S`:** Acelera a descida normal da peça (Descida Rápida).
*   **Seta para Cima (`↑`) ou `W`:** Rotaciona a peça em sentido horário.
*   **Barra de Espaço:** Queda instantânea (Dropa o bloco ao fundo e soma pontos bônus).
*   **Letra `P`:** Pausa e despausa o jogo a qualquer momento.

---

## 🔒 Persistência de Dados (Scores e Conquistas)
Nesta nova arquitetura (Fases 1, 2 e 3), a persistência de dados efêmera baseada em arquivo local foi completamente substituída em ambiente de produção pelo banco de dados **Google Cloud Firestore**. 

- **Scores (Leaderboard):** As pontuações são armazenadas permanentemente na coleção `scores` e servidas via Cache Materializado, garantindo alta disponibilidade e durabilidade sem impacto na escalabilidade do Cloud Run.
- **Conquistas (Badges):** A telemetria de jogo em tempo real alimenta a coleção `achievements`, que consolida métricas globais e troféus desbloqueados de forma individual para cada jogador de forma totalmente assíncrona.
