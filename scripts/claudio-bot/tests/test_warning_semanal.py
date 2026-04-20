"""
Testes para warning_semanal.py e ajustes em claudio.py.
Stdlib only — nao requer pytest/pip.

Rodar:
    cd ~/Claude-Code/saleszone/scripts/claudio-bot
    python3 -m unittest tests.test_warning_semanal -v
"""

import os
import sys
import unittest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import warning_semanal as ws
import claudio


class TestDateRange(unittest.TestCase):
    """get_date_range: modo sexta (semana trabalhada) e diario (hoje)."""

    def test_sexta_retorna_de_segunda_ate_hoje(self):
        sexta = datetime(2026, 4, 17, 8, 25)  # sexta
        start, end = ws.get_date_range(sexta, "sexta")
        self.assertEqual(start, datetime(2026, 4, 13, 0, 0, 0))  # segunda
        self.assertEqual(end.date(), sexta.date())

    def test_diario_retorna_hoje_inteiro(self):
        hoje = datetime(2026, 4, 20, 8, 25)
        start, end = ws.get_date_range(hoje, "diario")
        self.assertEqual(start, datetime(2026, 4, 20, 0, 0, 0))
        self.assertEqual(end, datetime(2026, 4, 20, 23, 59, 59))

    def test_start_sexta_zerado(self):
        sexta = datetime(2026, 4, 17, 14, 30)
        start, _ = ws.get_date_range(sexta, "sexta")
        self.assertEqual((start.hour, start.minute, start.second), (0, 0, 0))

    def test_diario_funciona_em_qualquer_dia_da_semana(self):
        quarta = datetime(2026, 4, 22, 14, 30)
        start, end = ws.get_date_range(quarta, "diario")
        self.assertEqual(start.date(), quarta.date())
        self.assertEqual(end.date(), quarta.date())

    def test_dia_invalido(self):
        with self.assertRaises(ValueError):
            ws.get_date_range(datetime(2026, 4, 17), "segunda")


class TestFilterLostsSemAtividade(unittest.TestCase):
    """Filtro do warning de sexta: lost na semana + sem atividade futura."""

    def setUp(self):
        self.monday = datetime(2026, 4, 13, 0, 0, 0)
        self.friday = datetime(2026, 4, 17, 23, 59, 59)

    def _deal(self, deal_id, status="lost", lost_time=None, next_activity=None, pipeline_id=14, owner="Larissa Marques"):
        return {
            "id": deal_id,
            "status": status,
            "lost_time": lost_time,
            "next_activity_date": next_activity,
            "pipeline_id": pipeline_id,
            "owner_name": owner,
        }

    def test_inclui_deal_lost_na_semana_sem_ativ(self):
        deals = [self._deal(1, lost_time="2026-04-15 14:00:00", next_activity=None)]
        result = ws.filter_losts_sem_atividade(deals, self.monday, self.friday)
        self.assertEqual([d["id"] for d in result], [1])

    def test_exclui_deal_lost_fora_da_semana(self):
        deals = [self._deal(2, lost_time="2026-04-10 10:00:00", next_activity=None)]
        result = ws.filter_losts_sem_atividade(deals, self.monday, self.friday)
        self.assertEqual(result, [])

    def test_exclui_deal_com_atividade_futura(self):
        deals = [self._deal(3, lost_time="2026-04-14 10:00:00", next_activity="2026-05-01")]
        result = ws.filter_losts_sem_atividade(deals, self.monday, self.friday)
        self.assertEqual(result, [])

    def test_exclui_deal_nao_lost(self):
        deals = [self._deal(4, status="open", lost_time=None, next_activity=None)]
        result = ws.filter_losts_sem_atividade(deals, self.monday, self.friday)
        self.assertEqual(result, [])

    def test_exclui_pipeline_nao_monitorado(self):
        deals = [self._deal(5, lost_time="2026-04-15 10:00:00", next_activity=None, pipeline_id=999)]
        result = ws.filter_losts_sem_atividade(deals, self.monday, self.friday)
        self.assertEqual(result, [])

    def test_next_activity_vazia_string_eh_null(self):
        deals = [
            self._deal(6, lost_time="2026-04-15 10:00:00", next_activity=""),
            self._deal(7, lost_time="2026-04-15 10:00:00", next_activity="null"),
        ]
        result = ws.filter_losts_sem_atividade(deals, self.monday, self.friday)
        ids = [d["id"] for d in result]
        self.assertEqual(sorted(ids), [6, 7])


class TestFilterReativacao(unittest.TestCase):
    """Filtro do warning de segunda: deals lost com atividade futura na semana."""

    def _deal(self, deal_id, status="lost", pipeline_id=14, owner="Larissa Marques", next_activity=None):
        return {
            "id": deal_id,
            "status": status,
            "pipeline_id": pipeline_id,
            "owner_name": owner,
            "next_activity_date": next_activity,
        }

    def test_inclui_deal_lost_com_activity_na_semana(self):
        deals = [self._deal(1, next_activity="2026-04-22")]
        result = ws.filter_reativacao(deals)
        self.assertEqual([d["id"] for d in result], [1])

    def test_exclui_deal_open(self):
        deals = [self._deal(2, status="open", next_activity="2026-04-22")]
        result = ws.filter_reativacao(deals)
        self.assertEqual(result, [])

    def test_exclui_deal_won(self):
        deals = [self._deal(3, status="won", next_activity="2026-04-22")]
        result = ws.filter_reativacao(deals)
        self.assertEqual(result, [])

    def test_exclui_pipeline_nao_monitorado(self):
        deals = [self._deal(4, pipeline_id=99, next_activity="2026-04-22")]
        result = ws.filter_reativacao(deals)
        self.assertEqual(result, [])


class TestClassifyByRole(unittest.TestCase):
    """Classificacao dos deals filtrados por pipeline x role x owner."""

    def test_agrupa_por_role_e_owner(self):
        deals = [
            {"id": 1, "owner_name": "Larissa Marques"},   # SZS PV
            {"id": 2, "owner_name": "Larissa Marques"},
            {"id": 3, "owner_name": "Gabriela Branco"},   # SZS Closer
        ]
        result = ws.classify_by_role(deals, "SZS")
        self.assertEqual(result["PV"]["Larissa Marques"], [1, 2])
        self.assertEqual(result["Closer"]["Gabriela Branco"], [3])

    def test_exclui_owners_em_excluded_owners(self):
        deals = [{"id": 1, "owner_name": "Morada - Mia"}]
        result = ws.classify_by_role(deals, "SZS")
        self.assertEqual(result["PV"], {})
        self.assertEqual(result["Closer"], {})

    def test_exclui_owners_nao_permitidos_no_pipeline(self):
        # Willian Miranda e MKT, nao esta em PIPELINE_USERS["SZS"]
        deals = [{"id": 1, "owner_name": "Willian Miranda"}]
        result = ws.classify_by_role(deals, "SZS")
        self.assertEqual(result["PV"], {})
        self.assertEqual(result["Closer"], {})

    def test_owner_fora_do_team_map_vai_pra_pv(self):
        deals = [{"id": 1, "owner_name": "Pessoa Nova"}]
        # Sem PIPELINE_USERS de "TESTE", allowed_owners = set() — todos passam
        result = ws.classify_by_role(deals, "TESTE_SEM_FILTRO")
        self.assertEqual(result["PV"]["Pessoa Nova"], [1])


class TestBuildMainMessage(unittest.TestCase):
    """Formato da mensagem principal deve seguir padrao existente."""

    def test_formato_losts_semana(self):
        msg = ws.build_main_message_semanal(
            "Comercial SZS", "Pré-vendas", 7, "UABC123", "losts_semana"
        )
        self.assertIn("[Comercial SZS - Pré-vendas]", msg)
        self.assertIn("7 deals", msg)
        self.assertIn("<@UABC123>", msg)
        # emoji losts
        self.assertIn(":black_circle:", msg)

    def test_formato_reativacao(self):
        msg = ws.build_main_message_semanal(
            "Comercial SZI", "Vendas", 3, "UDEF456", "reativacao"
        )
        self.assertIn("[Comercial SZI - Vendas]", msg)
        self.assertIn("3 deals", msg)
        self.assertIn("<@UDEF456>", msg)
        self.assertIn(":large_blue_circle:", msg)

    def test_labels_diferenciam_categorias(self):
        a = ws.build_main_message_semanal("X", "Vendas", 1, "U1", "losts_semana")
        b = ws.build_main_message_semanal("X", "Vendas", 1, "U1", "reativacao")
        self.assertNotEqual(a, b)


class TestAgentReply(unittest.TestCase):
    """Reply do agente deve seguir padrao existente (mention + owner + link deals)."""

    def test_formato_reply(self):
        msg = ws.build_agent_reply("Gabriela Branco", [100, 101], "losts_semana")
        self.assertIn("_Gabriela Branco_", msg)
        self.assertIn("2 ", msg)  # qtd
        self.assertIn("/deal/100", msg)
        self.assertIn("/deal/101", msg)


class TestClaudioSemAtividadePV(unittest.TestCase):
    """Ajuste em claudio.classify_deals: PV nao recebe mais sem_atividade."""

    def test_pv_sem_atividade_fica_vazio(self):
        deals = [{
            "id": 1,
            "owner_name": "Larissa Marques",  # SZS PV
            "next_activity_date": None,
            "status": "open",
        }]
        result = claudio.classify_deals(deals, "SZS")
        # PV nao recebe mais sem_atividade
        self.assertEqual(result["sem_atividade"]["PV"], {})

    def test_closer_sem_atividade_mantido(self):
        deals = [{
            "id": 2,
            "owner_name": "Gabriela Branco",  # SZS Closer
            "next_activity_date": None,
            "status": "open",
        }]
        result = claudio.classify_deals(deals, "SZS")
        self.assertEqual(result["sem_atividade"]["Closer"]["Gabriela Branco"], [2])

    def test_pv_atrasados_mantido(self):
        # atividade 3 dias no passado — overdue
        past = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
        deals = [{
            "id": 3,
            "owner_name": "Larissa Marques",
            "next_activity_date": past,
            "status": "open",
        }]
        result = claudio.classify_deals(deals, "SZS")
        self.assertEqual(result["atrasados"]["PV"]["Larissa Marques"], [3])


class TestInactiveOwners(unittest.TestCase):
    """Owners com user_id inativo vao pro bucket EX_OWNER_MARKER (formato b)."""

    def test_warning_semanal_agrupa_inativos_em_ex_marker(self):
        deals = [
            {"id": 1, "owner_name": "Natália Saramago", "user_id": 24602778},  # inativa
            {"id": 2, "owner_name": "Natália Saramago", "user_id": 24602778},
            {"id": 3, "owner_name": "Hellen Dias", "user_id": 99999},  # ativa
        ]
        result = ws.classify_by_role(deals, "SZI", inactive_user_ids={24602778})
        self.assertEqual(result["PV"][ws.EX_OWNER_MARKER], [1, 2])
        self.assertEqual(result["PV"]["Hellen Dias"], [3])

    def test_warning_semanal_inativo_bypassa_pipeline_users(self):
        # Owner nao esta em PIPELINE_USERS["SZI"] mas e inativo — passa
        deals = [{"id": 1, "owner_name": "Pessoa Saiu Nunca Foi", "user_id": 111}]
        result = ws.classify_by_role(deals, "SZI", inactive_user_ids={111})
        self.assertEqual(result["PV"][ws.EX_OWNER_MARKER], [1])

    def test_build_agent_reply_ex_marker_usa_manager_mention(self):
        msg = ws.build_agent_reply(ws.EX_OWNER_MARKER, [100, 101], "reativacao", manager_id="U123")
        self.assertIn("<@U123>", msg)
        self.assertIn("Ex-funcionários (distribuir)", msg)
        self.assertNotIn("__EX__", msg)

    def test_claudio_classify_inativo_em_ex_marker(self):
        past = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
        deals = [{
            "id": 99,
            "owner_name": "Natália Saramago",
            "user_id": 24602778,
            "next_activity_date": past,
            "status": "open",
        }]
        result = claudio.classify_deals(deals, "SZI", inactive_user_ids={24602778})
        self.assertEqual(result["atrasados"]["PV"][claudio.EX_OWNER_MARKER], [99])

    def test_claudio_build_agent_replies_ex_marker(self):
        msg = claudio.build_agent_replies(
            claudio.EX_OWNER_MARKER, [100], "atrasados", manager_id="U123"
        )
        self.assertIn("<@U123>", msg)
        self.assertIn("Ex-funcionários (distribuir)", msg)
        self.assertNotIn("__EX__", msg)

    def test_user_id_como_dict_extrai_id(self):
        # Pipedrive as vezes retorna user_id como {"id": X}
        deals = [{"id": 1, "owner_name": "X", "user_id": {"id": 24602778}}]
        result = ws.classify_by_role(deals, "SZI", inactive_user_ids={24602778})
        self.assertEqual(result["PV"][ws.EX_OWNER_MARKER], [1])


if __name__ == "__main__":
    unittest.main()
