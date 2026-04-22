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


def test_handle_patch_skips_when_should_send_false():
    """Não chama Timelines nem Slack quando condição não é atendida."""
    prev = _base_reg(is_opportunity=True)
    new = _base_reg(is_opportunity=True)  # sem transição
    with patch("services.webinar_fup.timelines") as mock_tl, \
         patch("services.webinar_fup.slack_notifier") as mock_slack, \
         patch("services.webinar_fup.db.update") as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_tl.find_chat_id.assert_not_called()
    mock_tl.send_message.assert_not_called()
    mock_slack.post_message.assert_not_called()
    mock_db_update.assert_not_called()


def test_handle_patch_skips_when_closer_not_allowed():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="outro-closer"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.timelines") as mock_tl, \
         patch("services.webinar_fup.slack_notifier") as mock_slack:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_tl.send_message.assert_not_called()
    mock_slack.post_message.assert_not_called()


def test_handle_patch_dry_run_logs_slack_but_does_not_send():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", True), \
         patch("services.webinar_fup.timelines") as mock_tl, \
         patch("services.webinar_fup.slack_notifier.post_message", return_value=True) as mock_post, \
         patch("services.webinar_fup.db.update") as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_tl.find_chat_id.assert_not_called()
    mock_tl.send_message.assert_not_called()
    mock_post.assert_called_once()
    # Dry-run NÃO marca fup_sent_at
    mock_db_update.assert_not_called()


def test_handle_patch_real_sends_message_and_marks_fup_sent_at():
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", False), \
         patch("services.webinar_fup.timelines.find_chat_id", return_value=99), \
         patch("services.webinar_fup.timelines.send_message", return_value={"status": "ok"}) as mock_send, \
         patch("services.webinar_fup.slack_notifier.post_message", return_value=True) as mock_post, \
         patch("services.webinar_fup.db.update") as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_send.assert_called_once()
    args, kwargs = mock_send.call_args
    assert kwargs.get("chat_id") == 99 or args[0] == 99
    # dedup: marca fup_sent_at no banco
    mock_db_update.assert_called_once()
    update_args = mock_db_update.call_args
    assert update_args[0][0] == "webinar_registrations"
    assert "fup_sent_at" in update_args[0][2]
    mock_post.assert_called_once()


def test_handle_patch_real_no_chat_found_releases_fup_slot():
    """Se o Timelines não achar o chat, reverte fup_sent_at=NULL — permite retry.

    Com CAS, o fluxo é:
      1) claim: UPDATE ... SET fup_sent_at=now WHERE fup_sent_at IS NULL (→ 1 row)
      2) find_chat_id falha
      3) release: UPDATE ... SET fup_sent_at=NULL (retry permitido)
    """
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", False), \
         patch("services.webinar_fup.timelines.find_chat_id", return_value=None), \
         patch("services.webinar_fup.timelines.send_message") as mock_send, \
         patch("services.webinar_fup.slack_notifier.post_message", return_value=True), \
         patch("services.webinar_fup.db.update", return_value=[{"id": "r1"}]) as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    mock_send.assert_not_called()
    # claim + release
    assert mock_db_update.call_count == 2
    release_call = mock_db_update.call_args_list[1]
    assert release_call[0][0] == "webinar_registrations"
    assert release_call[0][2] == {"fup_sent_at": None}


def test_handle_patch_real_send_failure_releases_fup_slot():
    """Se send_message retorna None (falha HTTP), reverte fup_sent_at=NULL."""
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", False), \
         patch("services.webinar_fup.timelines.find_chat_id", return_value=99), \
         patch("services.webinar_fup.timelines.send_message", return_value=None), \
         patch("services.webinar_fup.slack_notifier.post_message", return_value=True), \
         patch("services.webinar_fup.db.update", return_value=[{"id": "r1"}]) as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    assert mock_db_update.call_count == 2
    release_call = mock_db_update.call_args_list[1]
    assert release_call[0][2] == {"fup_sent_at": None}


def test_handle_patch_real_race_condition_aborts_when_slot_already_claimed():
    """Se CAS retorna 0 rows (outra thread claimou), aborta sem chamar Timelines."""
    prev = _base_reg(is_opportunity=None)
    new = _base_reg(is_opportunity=True)
    with patch("services.webinar_fup.get_closer_slug", return_value="mayara-marques"), \
         patch("services.webinar_fup.FUP_ALLOWED_CLOSER_SLUG", "mayara-marques"), \
         patch("services.webinar_fup.DRY_RUN_FUP", False), \
         patch("services.webinar_fup.timelines.find_chat_id") as mock_find, \
         patch("services.webinar_fup.timelines.send_message") as mock_send, \
         patch("services.webinar_fup.slack_notifier.post_message") as mock_post, \
         patch("services.webinar_fup.db.update", return_value=[]) as mock_db_update:
        webinar_fup.handle_patch_update(prev, new, session_id="sess1")
    # Claim foi chamado 1 vez e retornou 0 rows → abortou.
    mock_db_update.assert_called_once()
    claim_call = mock_db_update.call_args_list[0]
    assert claim_call[0][1] == {"id": "eq.r1", "fup_sent_at": "is.null"}
    mock_find.assert_not_called()
    mock_send.assert_not_called()
    mock_post.assert_not_called()
