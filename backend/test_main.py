import os
import json
import base64
import unittest
from unittest.mock import MagicMock, patch

# Configura variáveis de ambiente de teste antes de importar o main
os.environ["SCORES_FILE_PATH"] = "test_scores.json"

import backend.main as main

class TestTetrisBackend(unittest.TestCase):
    def setUp(self):
        # Limpar arquivo de teste local se existir
        if os.path.exists("test_scores.json"):
            try:
                os.remove("test_scores.json")
            except OSError:
                pass
        # Resetar mocks globais do módulo
        main.db = None
        main.publisher = None
        main.topic_path = None

    def tearDown(self):
        # Limpar arquivo de teste local se existir
        if os.path.exists("test_scores.json"):
            try:
                os.remove("test_scores.json")
            except OSError:
                pass

    def test_local_fallback_load_default(self):
        """Testa se carrega os scores padrão se o arquivo não existir."""
        scores = main.load_scores_local()
        self.assertEqual(len(scores), 5)
        self.assertEqual(scores[0]["name"], "NEON_MASTER")

    def test_local_fallback_save_and_load(self):
        """Testa se salva e carrega corretamente localmente."""
        test_data = [{"name": "TEST_PLAYER", "score": 999999, "level": 10, "lines": 100}]
        main.save_scores_local(test_data)
        scores = main.load_scores_local()
        self.assertEqual(len(scores), 1)
        self.assertEqual(scores[0]["name"], "TEST_PLAYER")

    @patch("backend.main.db")
    def test_firestore_load_empty_populates_defaults(self, mock_db):
        """Testa se popula valores padrão no Firestore se a coleção estiver vazia."""
        main.db = mock_db
        
        # Mocar coleções e consultas do Firestore
        mock_col = MagicMock()
        mock_query = MagicMock()
        mock_db.collection.return_value = mock_col
        mock_col.order_by.return_value = mock_query
        mock_query.limit.return_value = mock_query
        
        # Primeira chamada de stream() retorna lista vazia (coleção sem nada)
        # Segunda chamada (após popular) retorna o documento mocado
        mock_doc = MagicMock()
        mock_doc.to_dict.return_value = {"name": "MOCK_CHAMP", "score": 120000}
        
        mock_query.stream.side_effect = [[], [mock_doc]]
        
        # Chamar a função de carregamento do Firestore
        scores = main.load_scores_from_firestore()
        
        # Verificar se o batch foi criado para popular os dados padrões
        mock_db.batch.assert_called_once()
        self.assertEqual(len(scores), 1)
        self.assertEqual(scores[0]["name"], "MOCK_CHAMP")

    @patch("backend.main.db")
    def test_firestore_save_score(self, mock_db):
        """Testa o salvamento de um score no Firestore."""
        main.db = mock_db
        mock_col = MagicMock()
        mock_db.collection.return_value = mock_col
        
        test_entry = {"name": "NEW_HERO", "score": 150000, "level": 12, "lines": 120}
        main.save_score_to_firestore(test_entry)
        
        # Verifica se o documento foi adicionado na coleção do Firestore
        mock_col.add.assert_called_once_with(test_entry)

    @patch("backend.main.publisher")
    def test_pubsub_publish_success(self, mock_publisher):
        """Testa a publicação bem-sucedida de um score no Pub/Sub."""
        main.publisher = mock_publisher
        main.topic_path = "projects/test-project/topics/scores-topic"
        
        # Moca o retorno do publish (Future)
        mock_future = MagicMock()
        mock_future.result.return_value = "msg_123456"
        mock_publisher.publish.return_value = mock_future
        
        test_entry = {"name": "PUBSUB_PRO", "score": 300000, "level": 15, "lines": 150}
        success = main.publish_score_to_pubsub(test_entry)
        
        self.assertTrue(success)
        mock_publisher.publish.assert_called_once()
        
        # Verifica se o payload em bytes foi enviado corretamente
        args, kwargs = mock_publisher.publish.call_args
        self.assertEqual(args[0], "projects/test-project/topics/scores-topic")
        sent_bytes = args[1]
        decoded_sent_data = json.loads(sent_bytes.decode("utf-8"))
        self.assertEqual(decoded_sent_data["name"], "PUBSUB_PRO")

    @patch("backend.main.db")
    def test_pubsub_push_receiver_success(self, mock_db):
        """Testa se a rota Push do Pub/Sub decodifica a mensagem e salva no Firestore."""
        main.db = mock_db
        mock_col = MagicMock()
        mock_db.collection.return_value = mock_col
        
        # Constrói dados da partida mocado
        score_data = {"name": "PUBSUB_HERO", "score": 250000, "level": 15, "lines": 150}
        # Codifica o JSON da partida em Base64
        encoded_data = base64.b64encode(json.dumps(score_data).encode("utf-8")).decode("utf-8")
        
        # Constrói o payload estruturado como o Pub/Sub envia via Push
        payload = main.PubSubPushPayload(
            message={"data": encoded_data, "messageId": "12345"},
            subscription="projects/test-project/subscriptions/scores-topic-sub"
        )
        
        # Aciona o receiver diretamente no módulo
        response = main.pubsub_push_receiver(payload)
        
        self.assertEqual(response["status"], "success")
        # Garante que o método add() do Firestore foi chamado com o score decodificado
        mock_col.add.assert_called_once_with(score_data)

if __name__ == "__main__":
    unittest.main()