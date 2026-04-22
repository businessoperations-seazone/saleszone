import json
from unittest.mock import patch, MagicMock


def _mock_urlopen(response_body):
    """Build a context manager mock returning response_body as bytes."""
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(response_body).encode()
    mock_resp.__enter__ = lambda self: self
    mock_resp.__exit__ = lambda *a: False
    return mock_resp


def test_find_chat_id_returns_id_when_found():
    from services import timelines
    response = {"status": "ok", "data": {"chats": [{"id": 12345, "phone": "+5548999991111"}]}}
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.urllib.request.urlopen", return_value=_mock_urlopen(response)):
        result = timelines.find_chat_id("+5548999991111")
    assert result == 12345


def test_find_chat_id_returns_none_when_empty():
    from services import timelines
    response = {"status": "ok", "data": {"chats": []}}
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.urllib.request.urlopen", return_value=_mock_urlopen(response)):
        result = timelines.find_chat_id("+5548999999999")
    assert result is None


def test_find_chat_id_returns_none_when_no_token():
    from services import timelines
    with patch("services.timelines.TIMELINES_API_TOKEN", ""):
        result = timelines.find_chat_id("+5548999991111")
    assert result is None


def test_find_chat_id_returns_none_on_http_error():
    from services import timelines
    import urllib.error
    err = urllib.error.HTTPError("url", 500, "err", {}, None)
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.urllib.request.urlopen", side_effect=err):
        result = timelines.find_chat_id("+5548999991111")
    assert result is None


def test_send_message_posts_to_api_and_returns_response():
    from services import timelines
    response = {"status": "ok", "data": {"message_id": "m123"}}
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.TIMELINES_WA_ACCOUNT", "ca_xxx"), \
         patch("services.timelines.urllib.request.urlopen", return_value=_mock_urlopen(response)) as mock_urlopen:
        result = timelines.send_message(chat_id=12345, text="Olá teste")

    assert result == response
    req = mock_urlopen.call_args[0][0]
    assert req.get_method() == "POST"
    payload = json.loads(req.data.decode())
    assert payload["text"] == "Olá teste"


def test_send_message_returns_none_without_token():
    from services import timelines
    with patch("services.timelines.TIMELINES_API_TOKEN", ""):
        result = timelines.send_message(chat_id=12345, text="hi")
    assert result is None


def test_send_message_returns_none_on_http_error():
    from services import timelines
    import urllib.error
    err = urllib.error.HTTPError("url", 403, "forbidden", {}, None)
    with patch("services.timelines.TIMELINES_API_TOKEN", "tok"), \
         patch("services.timelines.urllib.request.urlopen", side_effect=err):
        result = timelines.send_message(chat_id=12345, text="hi")
    assert result is None
