from services import webinar_fup


def test_format_message_full_name():
    result = webinar_fup.format_message({"name": "João Pedro Coutinho"})
    assert "Oi João," in result
    assert "Mayara" in result


def test_format_message_single_name():
    result = webinar_fup.format_message({"name": "Ana"})
    assert "Oi Ana," in result


def test_format_message_empty_name_uses_fallback():
    result = webinar_fup.format_message({"name": ""})
    assert result.startswith("Oi, aqui é a Mayara")


def test_format_message_none_name_uses_fallback():
    result = webinar_fup.format_message({"name": None})
    assert result.startswith("Oi, aqui é a Mayara")


def _base_reg(**overrides):
    base = {
        "id": "r1",
        "name": "Ana Silva",
        "phone": "+5548999991111",
        "attended_at": "2026-04-20T15:00:00Z",
        "is_opportunity": True,
        "fup_sent_at": None,
    }
    base.update(overrides)
    return base


def test_should_send_fup_happy_path():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    assert webinar_fup.should_send_fup(prev, new) is True


def test_should_send_fup_false_when_no_transition():
    prev = _base_reg(is_opportunity=True)
    new = _base_reg(is_opportunity=True)
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_opportunity_not_true():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=False)
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_attended_at_null():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True, attended_at=None)
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_already_sent():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True, fup_sent_at="2026-04-20T15:10:00Z")
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_phone_empty():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True, phone="")
    assert webinar_fup.should_send_fup(prev, new) is False


def test_should_send_fup_false_when_phone_too_short():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True, phone="12345")
    assert webinar_fup.should_send_fup(prev, new) is False


from unittest.mock import patch


def test_get_closer_slug_returns_slug_when_chain_resolves():
    with patch("services.webinar_fup.db.select") as mock_select:
        mock_select.side_effect = [
            [{"id": "sess1", "closer_id": "c1"}],  # sessions
            [{"id": "c1", "slug": "mayara-marques"}],  # closers
        ]
        result = webinar_fup.get_closer_slug("sess1")
    assert result == "mayara-marques"


def test_get_closer_slug_returns_none_when_session_missing():
    with patch("services.webinar_fup.db.select", return_value=[]):
        result = webinar_fup.get_closer_slug("missing")
    assert result is None


def test_get_closer_slug_returns_none_when_closer_id_null():
    with patch("services.webinar_fup.db.select") as mock_select:
        mock_select.side_effect = [
            [{"id": "sess1", "closer_id": None}],
        ]
        result = webinar_fup.get_closer_slug("sess1")
    assert result is None
