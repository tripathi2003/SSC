package chat.ssc.secure.plugins;

import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;
import org.signal.libsignal.protocol.IdentityKey;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.SessionBuilder;
import org.signal.libsignal.protocol.SessionCipher;
import org.signal.libsignal.protocol.SignalProtocolAddress;
import org.signal.libsignal.protocol.groups.GroupCipher;
import org.signal.libsignal.protocol.groups.GroupSessionBuilder;
import org.signal.libsignal.protocol.message.CiphertextMessage;
import org.signal.libsignal.protocol.message.PreKeySignalMessage;
import org.signal.libsignal.protocol.message.SenderKeyDistributionMessage;
import org.signal.libsignal.protocol.message.SignalMessage;
import org.signal.libsignal.protocol.ecc.ECPublicKey;
import org.signal.libsignal.protocol.kem.KEMPublicKey;
import org.signal.libsignal.protocol.state.KyberPreKeyRecord;
import org.signal.libsignal.protocol.state.PreKeyBundle;
import org.signal.libsignal.protocol.state.PreKeyRecord;
import org.signal.libsignal.protocol.state.SignedPreKeyRecord;
import org.signal.libsignal.protocol.state.impl.InMemorySignalProtocolStore;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Official libsignal-android (org.signal:libsignal-android) — Engine 8.3–8.5.
 * Prekeys, X3DH sessions, and Double Ratchet encrypt/decrypt on-device.
 */
@CapacitorPlugin(name = "SscLibsignal")
public class SscLibsignalPlugin extends Plugin {

    private static final String PINNED_VERSION = "0.96.4";

    private static int peerDeviceId(PluginCall call) {
        Integer value = call.getInt("peer_device_id");
        if (value == null || value < 1) return 1;
        return Math.min(5, value);
    }

    @PluginMethod
    public void getLocalDeviceId(PluginCall call) {
        try {
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            JSObject ret = new JSObject();
            ret.put("device_id", store.getLocalDeviceId());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("getLocalDeviceId failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void setLocalDeviceId(PluginCall call) {
        try {
            Integer deviceId = call.getInt("device_id");
            if (deviceId == null || deviceId < 1 || deviceId > 5) {
                call.reject("device_id must be 1-5");
                return;
            }
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.setLocalDeviceId(deviceId);
            JSObject ret = new JSObject();
            ret.put("device_id", store.getLocalDeviceId());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("setLocalDeviceId failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getPinnedVersion(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("version", PINNED_VERSION);
        ret.put("source", "org.signal:libsignal-android");
        call.resolve(ret);
    }

    @PluginMethod
    public void generatePreKeyBundle(PluginCall call) {
        try {
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            InMemorySignalProtocolStore protocolStore = store.getProtocolStore();

            IdentityKeyPair identityKeyPair = protocolStore.getIdentityKeyPair();
            int registrationId = protocolStore.getLocalRegistrationId();
            int signedPreKeyId = getContext().getSharedPreferences("ssc_signal_store_v1", 0)
                    .getInt("signed_prekey_id", 1);
            SignedPreKeyRecord signedPreKey = protocolStore.loadSignedPreKey(signedPreKeyId);
            int kyberPreKeyId = getContext().getSharedPreferences("ssc_signal_store_v1", 0)
                    .getInt("kyber_prekey_id", 1);
            KyberPreKeyRecord kyberPreKey = protocolStore.loadKyberPreKey(kyberPreKeyId);

            JSObject ret = new JSObject();
            ret.put("libsignal_version", PINNED_VERSION);
            ret.put("registration_id", registrationId);
            ret.put("device_id", store.getLocalDeviceId());
            ret.put("identity_key_public", b64(identityKeyPair.getPublicKey().serialize()));
            ret.put("signed_prekey_id", signedPreKeyId);
            ret.put("signed_prekey_public", b64(signedPreKey.getKeyPair().getPublicKey().serialize()));
            ret.put("signed_prekey_signature", b64(signedPreKey.getSignature()));
            ret.put("kyber_prekey_id", kyberPreKeyId);
            ret.put("kyber_prekey_public", b64(kyberPreKey.getKeyPair().getPublicKey().serialize()));
            ret.put("kyber_prekey_signature", b64(kyberPreKey.getSignature()));

            JSArray oneTime = new JSArray();
            for (int preKeyId : store.getPreKeyIds()) {
                PreKeyRecord preKey = protocolStore.loadPreKey(preKeyId);
                JSObject entry = new JSObject();
                entry.put("prekey_id", preKey.getId());
                entry.put("public", b64(preKey.getKeyPair().getPublicKey().serialize()));
                oneTime.put(entry);
            }
            ret.put("one_time_prekeys", oneTime);

            call.resolve(ret);
        } catch (Exception e) {
            call.reject("libsignal prekey generation failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void hasSession(PluginCall call) {
        try {
            String peerUserId = call.getString("peer_user_id");
            if (peerUserId == null || peerUserId.isEmpty()) {
                call.reject("peer_user_id required");
                return;
            }
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            SignalProtocolAddress address = new SignalProtocolAddress(peerUserId, peerDeviceId(call));
            boolean hasSession = store.getProtocolStore().containsSession(address);
            JSObject ret = new JSObject();
            ret.put("has_session", hasSession);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("hasSession failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void establishSession(PluginCall call) {
        try {
            String peerUserId = call.getString("peer_user_id");
            String ourUserId = call.getString("our_user_id");
            JSObject bundleObj = call.getObject("bundle");
            if (peerUserId == null || peerUserId.isEmpty()) {
                call.reject("peer_user_id required");
                return;
            }
            if (ourUserId == null || ourUserId.isEmpty()) {
                call.reject("our_user_id required");
                return;
            }
            if (bundleObj == null) {
                call.reject("bundle required");
                return;
            }

            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            InMemorySignalProtocolStore protocolStore = store.getProtocolStore();
            int peerDev = bundleObj.has("device_id") ? Math.max(1, bundleObj.getInteger("device_id")) : peerDeviceId(call);
            int localDev = store.getLocalDeviceId();
            SignalProtocolAddress remoteAddress = new SignalProtocolAddress(peerUserId, peerDev);
            SignalProtocolAddress localAddress = new SignalProtocolAddress(ourUserId, localDev);
            boolean force = Boolean.TRUE.equals(call.getBoolean("force", false));
            if (force) {
                store.deleteSessionForPeer(peerUserId, peerDev);
            }
            boolean hadSession = !force && protocolStore.containsSession(remoteAddress);

            if (!hadSession) {
                PreKeyBundle bundle = buildPreKeyBundle(bundleObj);
                SessionBuilder builder = new SessionBuilder(
                        protocolStore,
                        remoteAddress,
                        localAddress
                );
                try {
                    builder.process(bundle);
                } catch (org.signal.libsignal.protocol.UntrustedIdentityException identityErr) {
                    store.resetPeerSignalState(peerUserId, peerDev);
                    protocolStore.saveIdentity(remoteAddress, bundle.getIdentityKey());
                    builder.process(bundle);
                }
                store.trackSessionPeer(peerUserId, peerDev);
                store.persistPeerIdentity(peerUserId, peerDev, bundle.getIdentityKey());
                store.persistSessions();
            }

            JSObject ret = new JSObject();
            ret.put("peer_user_id", peerUserId);
            ret.put("established", !hadSession);
            ret.put("already_had_session", hadSession);
            ret.put("has_session", protocolStore.containsSession(remoteAddress));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("establishSession failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void trustPeerIdentityFromBundle(PluginCall call) {
        try {
            String peerUserId = call.getString("peer_user_id");
            JSObject bundleObj = call.getObject("bundle");
            if (peerUserId == null || peerUserId.isEmpty()) {
                call.reject("peer_user_id required");
                return;
            }
            if (bundleObj == null) {
                call.reject("bundle required");
                return;
            }
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            InMemorySignalProtocolStore protocolStore = store.getProtocolStore();
            int peerDev = bundleObj.has("device_id") ? Math.max(1, bundleObj.getInteger("device_id")) : peerDeviceId(call);
            SignalProtocolAddress remoteAddress = new SignalProtocolAddress(peerUserId, peerDev);
            PreKeyBundle bundle = buildPreKeyBundle(bundleObj);
            protocolStore.saveIdentity(remoteAddress, bundle.getIdentityKey());
            store.persistPeerIdentity(peerUserId, peerDev, bundle.getIdentityKey());
            JSObject ret = new JSObject();
            ret.put("trusted", true);
            ret.put("peer_user_id", peerUserId);
            ret.put("peer_device_id", peerDev);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("trustPeerIdentityFromBundle failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void encryptSignalMessage(PluginCall call) {
        try {
            String peerUserId = call.getString("peer_user_id");
            String ourUserId = call.getString("our_user_id");
            String plaintext = call.getString("plaintext");
            if (peerUserId == null || peerUserId.isEmpty()) {
                call.reject("peer_user_id required");
                return;
            }
            if (ourUserId == null || ourUserId.isEmpty()) {
                call.reject("our_user_id required");
                return;
            }
            if (plaintext == null) {
                call.reject("plaintext required");
                return;
            }

            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            SessionCipher cipher = buildCipher(store, peerUserId, ourUserId, peerDeviceId(call), store.getLocalDeviceId());
            CiphertextMessage encrypted = cipher.encrypt(plaintext.getBytes(StandardCharsets.UTF_8));

            int peerDev = peerDeviceId(call);
            store.persistSessionsWithPeer(peerUserId, peerDev);

            JSObject ret = new JSObject();
            ret.put("protocol", "signal_v1");
            ret.put("ciphertext", b64(encrypted.serialize()));
            ret.put("signal_message_type", encrypted.getType());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("encryptSignalMessage failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void decryptSignalMessage(PluginCall call) {
        try {
            String peerUserId = call.getString("peer_user_id");
            String ourUserId = call.getString("our_user_id");
            String ciphertextB64 = call.getString("ciphertext");
            Integer messageType = call.getInt("signal_message_type");
            if (peerUserId == null || peerUserId.isEmpty()) {
                call.reject("peer_user_id required");
                return;
            }
            if (ourUserId == null || ourUserId.isEmpty()) {
                call.reject("our_user_id required");
                return;
            }
            if (ciphertextB64 == null || ciphertextB64.isEmpty()) {
                call.reject("ciphertext required");
                return;
            }
            if (messageType == null) {
                call.reject("signal_message_type required");
                return;
            }

            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            int peerDev = peerDeviceId(call);
            int localDev = store.getLocalDeviceId();
            byte[] serialized = decode(ciphertextB64);
            byte[] plaintextBytes;

            if (messageType == CiphertextMessage.PREKEY_TYPE) {
                PreKeySignalMessage message = new PreKeySignalMessage(serialized);
                plaintextBytes = decryptWithIdentityHeal(store, peerUserId, ourUserId, peerDev, localDev, message);
            } else if (messageType == CiphertextMessage.WHISPER_TYPE) {
                SignalMessage message = new SignalMessage(serialized);
                plaintextBytes = decryptWithIdentityHeal(store, peerUserId, ourUserId, peerDev, localDev, message);
            } else {
                call.reject("unsupported signal_message_type: " + messageType);
                return;
            }

            store.persistSessionsWithPeer(peerUserId, peerDev);

            JSObject ret = new JSObject();
            ret.put("plaintext", new String(plaintextBytes, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("decryptSignalMessage failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void createGroupSenderKeyDistribution(PluginCall call) {
        try {
            String ourUserId = call.getString("our_user_id");
            String distributionIdStr = call.getString("distribution_id");
            if (ourUserId == null || ourUserId.isEmpty()) {
                call.reject("our_user_id required");
                return;
            }
            if (distributionIdStr == null || distributionIdStr.isEmpty()) {
                call.reject("distribution_id required");
                return;
            }
            UUID distributionId = UUID.fromString(distributionIdStr);
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            SignalProtocolAddress localAddress = new SignalProtocolAddress(ourUserId, 1);
            GroupSessionBuilder builder = new GroupSessionBuilder(store);
            SenderKeyDistributionMessage skdm = builder.create(localAddress, distributionId);

            JSObject ret = new JSObject();
            ret.put("skdm", b64(skdm.serialize()));
            ret.put("distribution_id", distributionIdStr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("createGroupSenderKeyDistribution failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void processGroupSenderKeyDistribution(PluginCall call) {
        try {
            String senderUserId = call.getString("sender_user_id");
            String skdmB64 = call.getString("skdm");
            if (senderUserId == null || senderUserId.isEmpty()) {
                call.reject("sender_user_id required");
                return;
            }
            if (skdmB64 == null || skdmB64.isEmpty()) {
                call.reject("skdm required");
                return;
            }
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            SignalProtocolAddress senderAddress = new SignalProtocolAddress(senderUserId, 1);
            SenderKeyDistributionMessage skdm = new SenderKeyDistributionMessage(decode(skdmB64));
            GroupSessionBuilder builder = new GroupSessionBuilder(store);
            builder.process(senderAddress, skdm);

            JSObject ret = new JSObject();
            ret.put("processed", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("processGroupSenderKeyDistribution failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void hasGroupSenderKey(PluginCall call) {
        try {
            String senderUserId = call.getString("sender_user_id");
            String distributionIdStr = call.getString("distribution_id");
            if (senderUserId == null || distributionIdStr == null) {
                call.reject("sender_user_id and distribution_id required");
                return;
            }
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            boolean has = store.hasSenderKey(senderUserId, UUID.fromString(distributionIdStr));
            JSObject ret = new JSObject();
            ret.put("has_sender_key", has);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("hasGroupSenderKey failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void encryptGroupMessage(PluginCall call) {
        try {
            String ourUserId = call.getString("our_user_id");
            String distributionIdStr = call.getString("distribution_id");
            String plaintext = call.getString("plaintext");
            if (ourUserId == null || distributionIdStr == null || plaintext == null) {
                call.reject("our_user_id, distribution_id, and plaintext required");
                return;
            }
            UUID distributionId = UUID.fromString(distributionIdStr);
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            SignalProtocolAddress localAddress = new SignalProtocolAddress(ourUserId, 1);
            GroupCipher cipher = new GroupCipher(store, localAddress);
            CiphertextMessage encrypted = cipher.encrypt(distributionId, plaintext.getBytes(StandardCharsets.UTF_8));

            JSObject ret = new JSObject();
            ret.put("protocol", "signal_group_v1");
            ret.put("ciphertext", b64(encrypted.serialize()));
            ret.put("signal_message_type", encrypted.getType());
            ret.put("distribution_id", distributionIdStr);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("encryptGroupMessage failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void decryptGroupMessage(PluginCall call) {
        try {
            String senderUserId = call.getString("sender_user_id");
            String ciphertextB64 = call.getString("ciphertext");
            if (senderUserId == null || ciphertextB64 == null) {
                call.reject("sender_user_id and ciphertext required");
                return;
            }
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.ensureLocalKeys();
            SignalProtocolAddress senderAddress = new SignalProtocolAddress(senderUserId, 1);
            GroupCipher cipher = new GroupCipher(store, senderAddress);
            byte[] plain = cipher.decrypt(decode(ciphertextB64));

            JSObject ret = new JSObject();
            ret.put("plaintext", new String(plain, StandardCharsets.UTF_8));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("decryptGroupMessage failed: " + e.getMessage(), e);
        }
    }

    private byte[] decryptWithIdentityHeal(
            SscSignalStore store,
            String peerUserId,
            String ourUserId,
            int peerDeviceId,
            int localDeviceId,
            PreKeySignalMessage message
    ) throws Exception {
        InMemorySignalProtocolStore protocolStore = store.getProtocolStore();
        SignalProtocolAddress remoteAddress = new SignalProtocolAddress(peerUserId, peerDeviceId);
        SessionCipher cipher = buildCipher(store, peerUserId, ourUserId, peerDeviceId, localDeviceId);
        try {
            return cipher.decrypt(message);
        } catch (org.signal.libsignal.protocol.UntrustedIdentityException identityErr) {
            store.clearPeerIdentity(peerUserId, peerDeviceId);
            protocolStore.saveIdentity(remoteAddress, message.getIdentityKey());
            store.persistPeerIdentity(peerUserId, peerDeviceId, message.getIdentityKey());
            cipher = buildCipher(store, peerUserId, ourUserId, peerDeviceId, localDeviceId);
            return cipher.decrypt(message);
        }
    }

    private byte[] decryptWithIdentityHeal(
            SscSignalStore store,
            String peerUserId,
            String ourUserId,
            int peerDeviceId,
            int localDeviceId,
            SignalMessage message
    ) throws Exception {
        SessionCipher cipher = buildCipher(store, peerUserId, ourUserId, peerDeviceId, localDeviceId);
        try {
            return cipher.decrypt(message);
        } catch (org.signal.libsignal.protocol.UntrustedIdentityException identityErr) {
            store.resetPeerSignalState(peerUserId);
            cipher = buildCipher(store, peerUserId, ourUserId, peerDeviceId, localDeviceId);
            return cipher.decrypt(message);
        }
    }

    private SessionCipher buildCipher(
            SscSignalStore store,
            String peerUserId,
            String ourUserId,
            int peerDeviceId,
            int localDeviceId
    ) throws Exception {
        InMemorySignalProtocolStore protocolStore = store.getProtocolStore();
        SignalProtocolAddress remoteAddress = new SignalProtocolAddress(peerUserId, peerDeviceId);
        SignalProtocolAddress localAddress = new SignalProtocolAddress(ourUserId, localDeviceId);
        // libsignal 0.96 SessionCipher(store, localAddress, remoteAddress) — not (remote, local).
        return new SessionCipher(protocolStore, localAddress, remoteAddress);
    }

    private PreKeyBundle buildPreKeyBundle(JSObject obj) throws Exception {
        JSONObject json = new JSONObject(obj.toString());
        int registrationId = json.getInt("registration_id");
        int deviceId = json.optInt("device_id", 1);

        IdentityKey identityKey = new IdentityKey(decode(json.getString("identity_key_public")));

        int signedPreKeyId = json.getInt("signed_prekey_id");
        ECPublicKey signedPreKey = new ECPublicKey(decode(json.getString("signed_prekey_public")));
        byte[] signedPreKeySig = decode(json.getString("signed_prekey_signature"));

        int preKeyId = PreKeyBundle.NULL_PRE_KEY_ID;
        ECPublicKey preKeyPublic = null;
        JSONArray oneTime = json.optJSONArray("one_time_prekeys");
        if (oneTime != null && oneTime.length() > 0) {
            JSONObject first = oneTime.getJSONObject(0);
            preKeyId = first.getInt("prekey_id");
            preKeyPublic = new ECPublicKey(decode(first.getString("public")));
        }

        int kyberPreKeyId = json.getInt("kyber_prekey_id");
        KEMPublicKey kyberPublic = new KEMPublicKey(decode(json.getString("kyber_prekey_public")));
        byte[] kyberSig = decode(json.getString("kyber_prekey_signature"));

        return new PreKeyBundle(
                registrationId,
                deviceId,
                preKeyId,
                preKeyPublic,
                signedPreKeyId,
                signedPreKey,
                signedPreKeySig,
                identityKey,
                kyberPreKeyId,
                kyberPublic,
                kyberSig
        );
    }

    @PluginMethod
    public void deleteSession(PluginCall call) {
        try {
            String peerUserId = call.getString("peer_user_id");
            if (peerUserId == null || peerUserId.isEmpty()) {
                call.reject("peer_user_id required");
                return;
            }
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.deleteSessionForPeer(peerUserId);
            JSObject ret = new JSObject();
            ret.put("deleted", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("deleteSession failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void resetPeerSignalState(PluginCall call) {
        try {
            String peerUserId = call.getString("peer_user_id");
            if (peerUserId == null || peerUserId.isEmpty()) {
                call.reject("peer_user_id required");
                return;
            }
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.resetPeerSignalState(peerUserId, peerDeviceId(call));
            JSObject ret = new JSObject();
            ret.put("reset", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("resetPeerSignalState failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void clearAllSessions(PluginCall call) {
        try {
            SscSignalStore store = SscSignalStore.getInstance(getContext());
            store.clearAllSessions();
            JSObject ret = new JSObject();
            ret.put("cleared", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("clearAllSessions failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void resetLocalStore(PluginCall call) {
        try {
            SscSignalStore.wipeAll(getContext());
            JSObject ret = new JSObject();
            ret.put("wiped", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("resetLocalStore failed: " + e.getMessage(), e);
        }
    }

    private static String b64(byte[] data) {
        return Base64.encodeToString(data, Base64.NO_WRAP);
    }

    private static byte[] decode(String data) {
        return Base64.decode(data, Base64.NO_WRAP);
    }
}