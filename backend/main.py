import os
import json
import base64
import logging
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

# Configuração de logs
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Sophisticated Tetris Backend")

# Caminho para arquivo de scores (usado como fallback local)
SCORES_FILE = os.getenv("SCORES_FILE_PATH", "scores.json")
COLLECTION_NAME = "scores"
TOPIC_NAME = "scores-topic"
TELEMETRY_TOPIC_NAME = "telemetry-topic"

class ScoreEntry(BaseModel):
    name: str = Field(..., min_length=1, max_length=15)
    score: int = Field(..., ge=0)
    level: int = Field(..., ge=1)
    lines: int = Field(..., ge=0)
    session_id: str | None = Field(default=None)

class TelemetryEvent(BaseModel):
    session_id: str = Field(..., min_length=1)
    event_type: str = Field(..., pattern="^(line_clear|level_up|tetris_clear)$")
    value: int = Field(..., ge=1)

class PubSubPushPayload(BaseModel):
    message: dict
    subscription: str

# Scores padrão para inicializar o placar com estilo arcade retro
DEFAULT_SCORES = [
    {"name": "NEON_MASTER", "score": 100000, "level": 10, "lines": 100},
    {"name": "ARCADE_PRO", "score": 75000, "level": 8, "lines": 80},
    {"name": "RETRO_CHAMP", "score": 50000, "level": 5, "lines": 50},
    {"name": "TETRIS_FAN", "score": 25000, "level": 3, "lines": 30},
    {"name": "NEWBIE", "score": 5000, "level": 1, "lines": 10}
]

# Inicializa o Firestore de forma segura
db = None
try:
    # Se houver um emulador rodando ou se estiver na nuvem (Cloud Run/GCP),
    # o SDK do Google Cloud lida com as credenciais nativamente.
    # Usamos None como padrão para que o SDK autodetecte o ID do projeto atual na nuvem.
    from google.cloud import firestore
    project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    db = firestore.Client(project=project_id)
    logger.info(f"Firestore client successfully initialized with project: {db.project}")
except Exception as e:
    logger.warning(f"Could not initialize Firestore Client: {e}. Falling back to local JSON storage.")
    db = None

# Inicializa o Pub/Sub de forma segura (Publisher)
publisher = None
topic_path = None
telemetry_topic_path = None
try:
    from google.cloud import pubsub_v1
    pub_project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
    publisher = pubsub_v1.PublisherClient()
    
    # Se conseguirmos obter o projeto (seja da env ou resolvido pelo cliente)
    if pub_project_id or getattr(publisher, "project", None):
        resolved_project = pub_project_id or publisher.project
        topic_path = publisher.topic_path(resolved_project, TOPIC_NAME)
        telemetry_topic_path = publisher.topic_path(resolved_project, TELEMETRY_TOPIC_NAME)
        logger.info(f"Pub/Sub Publisher client successfully initialized. Topic path: {topic_path}")
        logger.info(f"Pub/Sub Telemetry Topic path initialized: {telemetry_topic_path}")
    else:
        logger.warning("Could not auto-detect GCP project for Pub/Sub. Falling back to direct database writes.")
        publisher = None
except Exception as e:
    logger.warning(f"Could not initialize Pub/Sub Publisher Client: {e}. Falling back to direct database writes.")
    publisher = None

def load_scores_local() -> List[Dict[str, Any]]:
    if not os.path.exists(SCORES_FILE):
        logger.info("Scores file not found. Pre-populating with default scores.")
        save_scores_local(DEFAULT_SCORES)
        return DEFAULT_SCORES
    try:
        with open(SCORES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error reading scores file: {e}. Returning default scores.")
        return DEFAULT_SCORES

def save_scores_local(scores: List[Dict[str, Any]]) -> None:
    try:
        with open(SCORES_FILE, "w", encoding="utf-8") as f:
            json.dump(scores, f, indent=4, ensure_ascii=False)
    except Exception as e:
        logger.error(f"Error saving scores file: {e}")

def populate_default_scores_firestore() -> None:
    if not db:
        return
    try:
        col_ref = db.collection(COLLECTION_NAME)
        batch = db.batch()
        for entry in DEFAULT_SCORES:
            doc_ref = col_ref.document()
            batch.set(doc_ref, entry)
        batch.commit()
        logger.info("Successfully populated Firestore with default retro scores.")
    except Exception as e:
        logger.error(f"Failed to populate default scores in Firestore: {e}")

def load_scores_from_firestore() -> List[Dict[str, Any]]:
    if db is None:
        return load_scores_local()
    try:
        col_ref = db.collection(COLLECTION_NAME)
        # Buscar os top 10 ordenados por pontuação decrescente
        query = col_ref.order_by("score", direction=firestore.Query.DESCENDING).limit(10)
        docs = list(query.stream())
        
        if not docs:
            logger.info("Firestore collection empty. Pre-populating with default scores.")
            populate_default_scores_firestore()
            docs = list(query.stream())
            
        return [doc.to_dict() for doc in docs]
    except Exception as e:
        logger.error(f"Error loading scores from Firestore: {e}. Falling back to local file.")
        return load_scores_local()

def update_leaderboard_cache_sync():
    """Atualiza o cache materializado do Top 10 diretamente do backend."""
    if db is None:
        return
    try:
        logger.info("Atualizando cache do leaderboard (CQRS interno)...")
        scores_ref = db.collection(COLLECTION_NAME)
        query = scores_ref.order_by("score", direction=firestore.Query.DESCENDING).limit(10)
        
        top_scores = [doc.to_dict() for doc in query.stream()]
        
        cache_ref = db.collection("cache").document("leaderboard")
        cache_ref.set({"top_10": top_scores})
        logger.info(f"Cache atualizado com sucesso! Total: {len(top_scores)}")
    except Exception as e:
        logger.error(f"Erro ao atualizar o cache internamente: {e}")

ACHIEVEMENTS_FILE = "achievements.json"

def load_achievements_local() -> Dict[str, Any]:
    if not os.path.exists(ACHIEVEMENTS_FILE):
        return {}
    try:
        with open(ACHIEVEMENTS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Error loading local achievements: {e}")
        return {}

def save_achievements_local(data: Dict[str, Any]) -> None:
    try:
        with open(ACHIEVEMENTS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
    except Exception as e:
        logger.error(f"Error saving local achievements: {e}")

def calculate_badges(total_lines: int, total_tetris: int, max_level: int) -> List[str]:
    badges = []
    # 1. Sobrevivência (Níveis)
    if max_level >= 3:
        badges.append("level_3")
    if max_level >= 7:
        badges.append("level_7")
    if max_level >= 10:
        badges.append("level_10")
        
    # 2. Volume (Acúmulo de Linhas)
    if total_lines >= 50:
        badges.append("lines_50")
    if total_lines >= 200:
        badges.append("lines_200")
    if total_lines >= 500:
        badges.append("lines_500")
        
    # 3. Habilidade (Tetris)
    if total_tetris >= 1:
        badges.append("tetris_1")
    if total_tetris >= 10:
        badges.append("tetris_10")
    if total_tetris >= 50:
        badges.append("tetris_50")
        
    return badges

def process_telemetry_event(event: Dict[str, Any]) -> Dict[str, Any]:
    session_id = event["session_id"].upper()
    event_type = event["event_type"]
    value = event["value"]
    
    if db is None:
        data = load_achievements_local()
        user_data = data.get(session_id, {
            "name": session_id,
            "total_lines_cleared": 0,
            "tetris_count": 0,
            "max_level_reached": 1,
            "badges": []
        })
        
        if event_type == "line_clear":
            user_data["total_lines_cleared"] += value
        elif event_type == "level_up":
            user_data["max_level_reached"] = max(user_data["max_level_reached"], value)
        elif event_type == "tetris_clear":
            user_data["tetris_count"] += value
            
        user_data["badges"] = calculate_badges(
            user_data["total_lines_cleared"],
            user_data["tetris_count"],
            user_data["max_level_reached"]
        )
        
        data[session_id] = user_data
        save_achievements_local(data)
        return user_data
        
    try:
        ach_ref = db.collection("achievements").document(session_id)
        doc = ach_ref.get()
        
        if doc.exists:
            user_data = doc.to_dict()
        else:
            user_data = {
                "name": session_id,
                "total_lines_cleared": 0,
                "tetris_count": 0,
                "max_level_reached": 1,
                "badges": []
            }
            
        if event_type == "line_clear":
            user_data["total_lines_cleared"] += value
        elif event_type == "level_up":
            user_data["max_level_reached"] = max(user_data["max_level_reached"], value)
        elif event_type == "tetris_clear":
            user_data["tetris_count"] += value
            
        user_data["badges"] = calculate_badges(
            user_data["total_lines_cleared"],
            user_data["tetris_count"],
            user_data["max_level_reached"]
        )
        
        ach_ref.set(user_data)
        logger.info(f"Achievements for {session_id} updated in Firestore.")
        return user_data
    except Exception as e:
        logger.error(f"Error processing Firestore telemetry event: {e}")
        return {}

def merge_achievements(session_id: str, player_name: str) -> None:
    if not session_id:
        return
    session_id = session_id.upper()
    player_name = player_name.upper()
    logger.info(f"Merging achievements from session {session_id} to player {player_name}...")
    
    if db is None:
        data = load_achievements_local()
        sess_data = data.get(session_id)
        if not sess_data:
            logger.warning(f"No local achievements found for session {session_id}")
            return
            
        player_data = data.get(player_name, {
            "name": player_name,
            "total_lines_cleared": 0,
            "tetris_count": 0,
            "max_level_reached": 1,
            "badges": []
        })
        
        player_data["total_lines_cleared"] += sess_data["total_lines_cleared"]
        player_data["tetris_count"] += sess_data["tetris_count"]
        player_data["max_level_reached"] = max(player_data["max_level_reached"], sess_data["max_level_reached"])
        player_data["badges"] = calculate_badges(
            player_data["total_lines_cleared"],
            player_data["tetris_count"],
            player_data["max_level_reached"]
        )
        
        data[player_name] = player_data
        if session_id in data:
            del data[session_id]
        save_achievements_local(data)
        logger.info(f"Local achievements successfully merged into player {player_name}")
        return

    try:
        ach_col = db.collection("achievements")
        sess_doc = ach_col.document(session_id).get()
        if not sess_doc.exists:
            logger.warning(f"No Firestore achievements found for session {session_id}")
            return
            
        sess_data = sess_doc.to_dict()
        player_doc = ach_col.document(player_name).get()
        
        if player_doc.exists:
            player_data = player_doc.to_dict()
        else:
            player_data = {
                "name": player_name,
                "total_lines_cleared": 0,
                "tetris_count": 0,
                "max_level_reached": 1,
                "badges": []
            }
            
        player_data["total_lines_cleared"] += sess_data["total_lines_cleared"]
        player_data["tetris_count"] += sess_data["tetris_count"]
        player_data["max_level_reached"] = max(player_data["max_level_reached"], sess_data["max_level_reached"])
        player_data["badges"] = calculate_badges(
            player_data["total_lines_cleared"],
            player_data["tetris_count"],
            player_data["max_level_reached"]
        )
        
        ach_col.document(player_name).set(player_data)
        ach_col.document(session_id).delete()
        logger.info(f"Firestore achievements from session {session_id} successfully merged into {player_name}")
    except Exception as e:
        logger.error(f"Error merging achievements: {e}")

def save_score_to_firestore(entry: Dict[str, Any]) -> None:
    session_id = entry.get("session_id")
    # Limpa o session_id antes de salvar o score cru no Firestore
    score_data = {k: v for k, v in entry.items() if k != "session_id"}
    
    if db is None:
        # Se estiver no modo local, adiciona o score na lista local e salva
        local_scores = load_scores_local()
        local_scores.append(score_data)
        local_scores = sorted(local_scores, key=lambda x: x["score"], reverse=True)[:10]
        save_scores_local(local_scores)
        if session_id:
            merge_achievements(session_id, entry["name"])
        return
    try:
        col_ref = db.collection(COLLECTION_NAME)
        col_ref.add(score_data)
        logger.info(f"Score for {entry['name']} successfully saved to Firestore.")
        if session_id:
            merge_achievements(session_id, entry["name"])
        # Atualiza o cache do ranking imediatamente após salvar o score
        update_leaderboard_cache_sync()
    except Exception as e:
        logger.error(f"Error saving score to Firestore: {e}. Saving to local fallback.")
        # Em caso de erro temporário no Firestore, salva local também
        try:
            local_scores = load_scores_local()
            local_scores.append(score_data)
            local_scores = sorted(local_scores, key=lambda x: x["score"], reverse=True)[:10]
            save_scores_local(local_scores)
            if session_id:
                merge_achievements(session_id, entry["name"])
        except Exception as local_err:
            logger.error(f"Failed to save to local fallback: {local_err}")

def publish_score_to_pubsub(entry: Dict[str, Any]) -> bool:
    if publisher is None or topic_path is None:
        logger.info("Pub/Sub client not active. Fallback: direct write to Firestore/local.")
        save_score_to_firestore(entry)
        return False
    try:
        # Serializar dicionário para string JSON e codificar em bytes
        data_bytes = json.dumps(entry).encode("utf-8")
        # Publicar no Pub/Sub
        future = publisher.publish(topic_path, data_bytes)
        message_id = future.result()
        logger.info(f"Score for {entry['name']} successfully published to Pub/Sub. Message ID: {message_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to publish to Pub/Sub: {e}. Fallback: direct write.")
        save_score_to_firestore(entry)
        return False

def publish_telemetry_to_pubsub(event: Dict[str, Any]) -> bool:
    if publisher is None or telemetry_topic_path is None:
        logger.info("Pub/Sub telemetry client not active. Fallback: direct processing.")
        process_telemetry_event(event)
        return False
    try:
        # Serializar dicionário para string JSON e codificar em bytes
        data_bytes = json.dumps(event).encode("utf-8")
        # Publicar no Pub/Sub
        future = publisher.publish(telemetry_topic_path, data_bytes)
        message_id = future.result()
        logger.info(f"Telemetry event successfully published to Pub/Sub. Message ID: {message_id}")
        return True
    except Exception as e:
        logger.error(f"Failed to publish telemetry to Pub/Sub: {e}. Fallback: direct processing.")
        process_telemetry_event(event)
        return False

@app.post("/api/telemetry")
def add_telemetry_event(event: TelemetryEvent):
    """Recebe eventos de telemetria (linhas, níveis, tetris) e envia para processamento assíncrono."""
    event_dict = event.model_dump()
    publish_telemetry_to_pubsub(event_dict)
    return {"status": "ok"}

@app.get("/api/achievements/{session_id}")
def get_achievements(session_id: str):
    """Busca as conquistas de um jogador específico."""
    session_id = session_id.upper()
    if db is None:
        data = load_achievements_local()
        return data.get(session_id, {"badges": []})
        
    try:
        doc = db.collection("achievements").document(session_id).get()
        if doc.exists:
            return doc.to_dict()
        return {"badges": []}
    except Exception as e:
        logger.error(f"Error fetching achievements: {e}")
        return {"badges": []}

@app.post("/api/internal/telemetry-worker")
def telemetry_pubsub_push_receiver(payload: PubSubPushPayload):
    """Webhook para o Pub/Sub processar os eventos de telemetria assincronamente."""
    try:
        message_data = payload.message.get("data")
        if not message_data:
            raise HTTPException(status_code=400, detail="Invalid Pub/Sub message")
            
        decoded_str = base64.b64decode(message_data).decode("utf-8")
        event_dict = json.loads(decoded_str)
        validated_event = TelemetryEvent(**event_dict)
        
        process_telemetry_event(validated_event.model_dump())
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Error processing telemetry Push message: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process telemetry message: {str(e)}")

@app.get("/api/scores", response_model=List[Dict[str, Any]])
def get_scores():
    """
    Recupera os 10 melhores placares usando Cache Materializado.
    Lê apenas um documento estático gerado pela Cloud Function (Trigger).
    """
    if db:
        try:
            # Leitura Otimizada: 1 única leitura de documento em vez de query na coleção
            cache_doc = db.collection("cache").document("leaderboard").get()
            
            if cache_doc.exists:
                logger.info("Retornando scores do cache otimizado.")
                return cache_doc.to_dict().get("top_10", [])
            else:
                logger.warning("Cache não encontrado. Fazendo fallback para query pesada e leitura local.")
                # Fallback caso a Cloud Function ainda não tenha criado o cache
                scores = load_scores_from_firestore()
                return sorted(scores, key=lambda x: x["score"], reverse=True)[:10]
                
        except Exception as e:
            logger.error(f"Erro ao ler do cache do Firestore: {e}")
            scores = load_scores_from_firestore()
            return sorted(scores, key=lambda x: x["score"], reverse=True)[:10]
    else:
        scores = load_scores_local()
        return sorted(scores, key=lambda x: x["score"], reverse=True)[:10]

@app.post("/api/scores", response_model=List[Dict[str, Any]])
def add_score(entry: ScoreEntry):
    """Adiciona um novo placar. Publica no Pub/Sub de forma assíncrona se disponível."""
    logger.info(f"Adding score: {entry.name} - {entry.score}")
    entry_dict = entry.model_dump()
    publish_score_to_pubsub(entry_dict)
    return get_scores()

@app.post("/api/internal/scores-worker")
def pubsub_push_receiver(payload: PubSubPushPayload):
    """Gatilho Push do Pub/Sub que recebe mensagens assíncronas e grava no Firestore."""
    try:
        # Extrair dados da mensagem
        message_data = payload.message.get("data")
        if not message_data:
            raise HTTPException(status_code=400, detail="Invalid Pub/Sub message: missing 'data'")
            
        # Decodificar de base64 para string UTF-8
        decoded_bytes = base64.b64decode(message_data)
        decoded_str = decoded_bytes.decode("utf-8")
        
        # Converter a string em dicionário JSON
        entry_dict = json.loads(decoded_str)
        logger.info(f"Pub/Sub Push received message: {entry_dict}")
        
        # Validar dados usando o modelo de entrada
        validated_entry = ScoreEntry(**entry_dict)
        
        # Gravar no Firestore (ou fallback local se db for None)
        save_score_to_firestore(validated_entry.model_dump())
        
        return {"status": "success", "message": "Score successfully persisted via Pub/Sub"}
    except Exception as e:
        logger.error(f"Error processing Pub/Sub Push message: {e}")
        # Retorna erro 500 para o Pub/Sub saber que deve tentar novamente (retry)
        raise HTTPException(status_code=500, detail=f"Failed to process message: {str(e)}")

# Montagem dos arquivos estáticos do frontend.
# Criamos a pasta estática se não existir para evitar erros ao iniciar o FastAPI
STATIC_DIR = "static"
if not os.path.exists(STATIC_DIR):
    os.makedirs(STATIC_DIR, exist_ok=True)

app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
