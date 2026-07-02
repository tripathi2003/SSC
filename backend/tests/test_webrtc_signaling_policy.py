"""Engine 8 Step 8.7 — WebRTC signaling policy tests."""
import base64
import uuid

import pytest

from core.webrtc_signaling_policy import (
    SignalingProtocol,
    SignalingValidationError,
    normalize_signaling_protocol,
    server_sees_signaling_plaintext,
    validate_signaling_relay,
)

_VALID_CT = base64.b64encode(b"x" * 32).decode("ascii")


def test_normalize_unknown_defaults_legacy():
    assert normalize_signaling_protocol(None) == SignalingProtocol.LEGACY_CLEARTEXT.value
    assert normalize_signaling_protocol("bogus") == SignalingProtocol.LEGACY_CLEARTEXT.value


def test_legacy_call_offer_ok():
    out = validate_signaling_relay({
        "type": "call-offer",
        "to": "u2",
        "sdp": {"type": "offer", "sdp": "v=0"},
        "mode": "audio",
    })
    assert out["signaling_protocol"] == SignalingProtocol.LEGACY_CLEARTEXT.value
    assert out["sdp"]["type"] == "offer"


def test_legacy_call_offer_missing_sdp_rejected():
    with pytest.raises(SignalingValidationError):
        validate_signaling_relay({"type": "call-offer", "to": "u2"})


def test_signal_v1_offer_ok():
    out = validate_signaling_relay({
        "type": "call-offer",
        "to": "u2",
        "mode": "video",
        "signaling_protocol": "signal_v1",
        "signaling_ciphertext": _VALID_CT,
        "signal_message_type": 2,
    })
    assert out["signaling_protocol"] == SignalingProtocol.SIGNAL_V1.value
    assert out["sdp"] is None
    assert out["candidate"] is None


def test_signal_v1_rejects_cleartext_sdp():
    with pytest.raises(SignalingValidationError):
        validate_signaling_relay({
            "type": "call-offer",
            "to": "u2",
            "signaling_protocol": "signal_v1",
            "signaling_ciphertext": _VALID_CT,
            "signal_message_type": 2,
            "sdp": {"type": "offer", "sdp": "leak"},
        })


def test_signal_v1_ice_candidate_ok():
    out = validate_signaling_relay({
        "type": "ice-candidate",
        "to": "u2",
        "signaling_protocol": "signal_v1",
        "signaling_ciphertext": _VALID_CT,
        "signal_message_type": 3,
    })
    assert out["signal_message_type"] == 3


def test_signal_v1_group_offer_ok():
    dist_id = str(uuid.uuid4())
    out = validate_signaling_relay({
        "type": "call-offer",
        "to": "u2",
        "group": True,
        "mode": "audio",
        "signaling_protocol": "signal_v1",
        "signaling_ciphertext": _VALID_CT,
        "signal_message_type": 7,
        "distribution_id": dist_id,
    })
    assert out["signaling_protocol"] == SignalingProtocol.SIGNAL_V1.value
    assert out["signal_message_type"] == 7
    assert out["distribution_id"] == dist_id
    assert out["sdp"] is None


def test_signal_v1_group_answer_ok():
    dist_id = str(uuid.uuid4())
    out = validate_signaling_relay({
        "type": "call-answer",
        "to": "u1",
        "group": True,
        "signaling_protocol": "signal_v1",
        "signaling_ciphertext": _VALID_CT,
        "signal_message_type": 7,
        "distribution_id": dist_id,
    })
    assert out["signaling_protocol"] == SignalingProtocol.SIGNAL_V1.value
    assert out["signal_message_type"] == 7
    assert out["distribution_id"] == dist_id
    assert out["sdp"] is None
    assert out["candidate"] is None


def test_signal_v1_group_ice_candidate_ok():
    dist_id = str(uuid.uuid4())
    out = validate_signaling_relay({
        "type": "ice-candidate",
        "to": "u1",
        "group": True,
        "signaling_protocol": "signal_v1",
        "signaling_ciphertext": _VALID_CT,
        "signal_message_type": 7,
        "distribution_id": dist_id,
    })
    assert out["signaling_protocol"] == SignalingProtocol.SIGNAL_V1.value
    assert out["signal_message_type"] == 7
    assert out["distribution_id"] == dist_id
    assert out["candidate"] is None


def test_signal_v1_group_rejects_missing_distribution_id():
    with pytest.raises(SignalingValidationError, match="distribution_id"):
        validate_signaling_relay({
            "type": "call-offer",
            "to": "u2",
            "group": True,
            "signaling_protocol": "signal_v1",
            "signaling_ciphertext": _VALID_CT,
            "signal_message_type": 7,
        })


def test_signal_v1_group_rejects_1to1_message_types():
    with pytest.raises(SignalingValidationError):
        validate_signaling_relay({
            "type": "call-offer",
            "to": "u2",
            "group": True,
            "signaling_protocol": "signal_v1",
            "signaling_ciphertext": _VALID_CT,
            "signal_message_type": 2,
            "distribution_id": str(uuid.uuid4()),
        })


def test_group_call_rejects_legacy_cleartext():
    with pytest.raises(SignalingValidationError, match="signal_v1"):
        validate_signaling_relay({
            "type": "call-offer",
            "to": "u2",
            "group": True,
            "sdp": {"type": "offer", "sdp": "v=0"},
        })


def test_control_types_pass_through():
    out = validate_signaling_relay({"type": "call-end", "to": "u2"})
    assert out["type"] == "call-end"
    out2 = validate_signaling_relay({"type": "call-reject", "to": "u2"})
    assert out2["type"] == "call-reject"


def test_group_call_raise_hand_requires_group_flag():
    out = validate_signaling_relay({
        "type": "call-raise-hand",
        "to": "u2",
        "group": True,
        "raised": True,
    })
    assert out["raised"] is True
    with pytest.raises(SignalingValidationError):
        validate_signaling_relay({"type": "call-raise-hand", "to": "u2", "raised": True})


def test_group_call_mute_all_passes_through():
    out = validate_signaling_relay({"type": "call-mute-all", "to": "u2", "group": True})
    assert out["type"] == "call-mute-all"


def test_call_sfu_invite_ok():
    out = validate_signaling_relay({
        "type": "call-sfu-invite",
        "to": "u2",
        "group": True,
        "mode": "video",
        "conversation_id": "g_conv1",
        "members": [{"user_id": "u1"}, {"user_id": "u2"}],
    })
    assert out["type"] == "call-sfu-invite"
    assert out["conversation_id"] == "g_conv1"


def test_call_sfu_invite_requires_group_and_conversation():
    with pytest.raises(SignalingValidationError):
        validate_signaling_relay({
            "type": "call-sfu-invite",
            "to": "u2",
            "mode": "audio",
            "conversation_id": "g_conv1",
        })


def test_server_sees_plaintext_matrix():
    assert server_sees_signaling_plaintext("signal_v1", is_group=False) is False
    assert server_sees_signaling_plaintext("legacy_cleartext", is_group=False) is True
    assert server_sees_signaling_plaintext("signal_v1", is_group=True) is False
    assert server_sees_signaling_plaintext("legacy_cleartext", is_group=True) is True