import json
from unittest.mock import patch, MagicMock


def _mock_urlopen(response_body):
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(response_body).encode()
    mock_resp.__enter__ = lambda self: self
    mock_resp.__exit__ = lambda *a: False
    return mock_resp


def test_post_message_sends_payload():
    from services import slack_notifier
    response = {"ok": True, "ts": "1234.5678"}
    with patch("services.slack_notifier.SLACK_BOT_TOKEN", "xoxb-test"), \
         patch("services.slack_notifier.urllib.request.urlopen", return_value=_mock_urlopen(response)) as mock_urlopen:
        result = slack_notifier.post_message(channel="D07M0MKUJUS", text="hello")
    assert result is True
    req = mock_urlopen.call_args[0][0]
    payload = json.loads(req.data.decode())
    assert payload == {"channel": "D07M0MKUJUS", "text": "hello"}
    assert req.headers["Authorization"] == "Bearer xoxb-test"


def test_post_message_returns_false_without_token():
    from services import slack_notifier
    with patch("services.slack_notifier.SLACK_BOT_TOKEN", ""):
        result = slack_notifier.post_message(channel="D07M0MKUJUS", text="hello")
    assert result is False


def test_post_message_returns_false_when_api_not_ok():
    from services import slack_notifier
    response = {"ok": False, "error": "channel_not_found"}
    with patch("services.slack_notifier.SLACK_BOT_TOKEN", "xoxb-test"), \
         patch("services.slack_notifier.urllib.request.urlopen", return_value=_mock_urlopen(response)):
        result = slack_notifier.post_message(channel="bad", text="hi")
    assert result is False
