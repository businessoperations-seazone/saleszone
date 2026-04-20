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
