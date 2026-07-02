package chat.ssc.secure.plugins;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.signal.libsignal.protocol.IdentityKey;
import org.signal.libsignal.protocol.IdentityKeyPair;
import org.signal.libsignal.protocol.SignalProtocolAddress;
import org.signal.libsignal.protocol.ecc.ECKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyPair;
import org.signal.libsignal.protocol.kem.KEMKeyType;
import org.signal.libsignal.protocol.state.KyberPreKeyRecord;
import org.signal.libsignal.protocol.state.PreKeyRecord;
import org.signal.libsignal.protocol.state.SessionRecord;
import org.signal.libsignal.protocol.state.SignedPreKeyRecord;
import org.signal.libsignal.protocol.groups.state.SenderKeyRecord;
import org.signal.libsignal.protocol.groups.state.SenderKeyStore;
import org.signal.libsignal.protocol.state.impl.InMemorySignalProtocolStore;
import org.signal.libsignal.protocol.util.KeyHelper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;

/**
 * Persistent libsignal protocol store — Engine 8.4.
 * Identity, prekeys, and X3DH session records stay on device only.
 */
public class SscSignalStore implements SenderKeyStore {

    private static final String PREFS_NAME = "ssc_signal_store_v1";
    private static final int ONE_TIME_PREKEY_COUNT = 20;

    private static SscSignalStore instance;

    private final SharedPreferences prefs;
    private InMemorySignalProtocolStore protocolStore;
    private int signedPreKeyId = 1;
    private int kyberPreKeyId = 1;

    private SscSignalStore(Context context) throws Exception {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        IdentityKeyPair identity;
        int registrationId;
        if (prefs.contains("identity_key_pair")) {
            identity = new IdentityKeyPair(decode(prefs.getString("identity_key_pair", "")));
            registrationId = prefs.getInt("registration_id", KeyHelper.generateRegistrationId(false));
        } else {
            identity = IdentityKeyPair.generate();
            registrationId = KeyHelper.generateRegistrationId(false);
        }
        protocolStore = new InMemorySignalProtocolStore(identity, registrationId);
        signedPreKeyId = prefs.getInt("signed_prekey_id", 1);
        kyberPreKeyId = prefs.getInt("kyber_prekey_id", 1);
        loadPreKeysAndSessions();
        loadTrustedIdentities();
    }

    public static synchronized SscSignalStore getInstance(Context context) throws Exception {
        if (instance == null) {
            instance = new SscSignalStore(context);
        }
        return instance;
    }

    public InMemorySignalProtocolStore getProtocolStore() {
        return protocolStore;
    }

    public boolean hasLocalMaterial() {
        return prefs.contains("signed_prekey");
    }

    /**
     * Ensure identity + signed/kyber/one-time prekeys exist and match persisted metadata.
     * Repairs missing one-time prekeys instead of returning early on partial corrupt state.
     */
    public synchronized void ensureLocalKeys() throws Exception {
        IdentityKeyPair identityKeyPair = protocolStore.getIdentityKeyPair();
        int registrationId = protocolStore.getLocalRegistrationId();
        boolean needsPersist = false;

        if (!prefs.contains("signed_prekey")) {
            ECKeyPair signedPreKeyPair = ECKeyPair.generate();
            byte[] signedPreKeySignature = identityKeyPair
                    .getPrivateKey()
                    .calculateSignature(signedPreKeyPair.getPublicKey().serialize());
            SignedPreKeyRecord signedPreKey = new SignedPreKeyRecord(
                    signedPreKeyId,
                    System.currentTimeMillis(),
                    signedPreKeyPair,
                    signedPreKeySignature
            );
            protocolStore.storeSignedPreKey(signedPreKeyId, signedPreKey);

            KEMKeyPair kyberPair = KEMKeyPair.generate(KEMKeyType.KYBER_1024);
            byte[] kyberSignature = identityKeyPair
                    .getPrivateKey()
                    .calculateSignature(kyberPair.getPublicKey().serialize());
            KyberPreKeyRecord kyberPreKey = new KyberPreKeyRecord(
                    kyberPreKeyId,
                    System.currentTimeMillis(),
                    kyberPair,
                    kyberSignature
            );
            protocolStore.storeKyberPreKey(kyberPreKeyId, kyberPreKey);
            needsPersist = true;
        }

        List<Integer> repairedIds = repairOneTimePreKeys();
        if (!repairedIds.isEmpty()) {
            needsPersist = true;
        }

        if (needsPersist) {
            SignedPreKeyRecord signedPreKey = protocolStore.loadSignedPreKey(signedPreKeyId);
            KyberPreKeyRecord kyberPreKey = protocolStore.loadKyberPreKey(kyberPreKeyId);
            List<Integer> idsToPersist = repairedIds.isEmpty() ? getPreKeyIds() : repairedIds;
            persistKeyMaterial(identityKeyPair, registrationId, signedPreKey, kyberPreKey, idsToPersist);
        }

        verifyKeyMaterialIntegrity();
    }

    /** @return sorted one-time prekey ids (non-empty when ids were added or metadata was stale) */
    private List<Integer> repairOneTimePreKeys() throws Exception {
        Set<Integer> loadable = new TreeSet<>();
        List<Integer> listed = hasLocalMaterial() ? getPreKeyIds() : new ArrayList<>();
        for (int id : listed) {
            try {
                protocolStore.loadPreKey(id);
                loadable.add(id);
            } catch (Exception ignored) {
                // listed in prefs but missing from memory/disk — regenerate below
            }
        }

        boolean changed = loadable.size() != listed.size();
        int nextId = 1;
        while (loadable.size() < ONE_TIME_PREKEY_COUNT) {
            while (loadable.contains(nextId)) {
                nextId += 1;
            }
            PreKeyRecord preKey = new PreKeyRecord(nextId, ECKeyPair.generate());
            protocolStore.storePreKey(nextId, preKey);
            loadable.add(nextId);
            changed = true;
            nextId += 1;
        }
        if (!changed && hasLocalMaterial()) {
            return new ArrayList<>();
        }
        return new ArrayList<>(loadable);
    }

    private void verifyKeyMaterialIntegrity() throws Exception {
        if (!prefs.contains("signed_prekey")) {
            throw new Exception("signed prekey missing after ensureLocalKeys");
        }
        if (!prefs.contains("kyber_prekey")) {
            throw new Exception("kyber prekey missing after ensureLocalKeys");
        }
        protocolStore.loadSignedPreKey(signedPreKeyId);
        protocolStore.loadKyberPreKey(kyberPreKeyId);
        List<Integer> ids = getPreKeyIds();
        if (ids.size() < ONE_TIME_PREKEY_COUNT) {
            throw new Exception("insufficient one-time prekey ids after ensureLocalKeys");
        }
        for (int id : ids) {
            protocolStore.loadPreKey(id);
        }
    }

    public synchronized void persistSessions() throws JSONException {
        Set<String> addrs = loadSessionPeerAddrs();
        SharedPreferences.Editor editor = prefs.edit();
        Set<String> active = new HashSet<>();
        for (String addr : addrs) {
            String[] parts = splitSessionAddr(addr);
            if (parts == null) {
                continue;
            }
            String peerId = parts[0];
            int deviceId = Integer.parseInt(parts[1]);
            SignalProtocolAddress address = new SignalProtocolAddress(peerId, deviceId);
            if (!protocolStore.containsSession(address)) {
                editor.remove(sessionKey(peerId, deviceId));
                editor.remove(legacySessionKey(peerId));
                continue;
            }
            SessionRecord session = protocolStore.loadSession(address);
            editor.putString(sessionKey(peerId, deviceId), encode(session.serialize()));
            active.add(sessionAddr(peerId, deviceId));
        }
        editor.putStringSet("session_peer_addrs", active);
        editor.remove("session_peer_ids");
        if (!editor.commit()) {
            throw new JSONException("failed to commit signal sessions");
        }
    }

    /** Atomic persist of identity + all prekey material (single commit). */
    private void persistKeyMaterial(
            IdentityKeyPair identityKeyPair,
            int registrationId,
            SignedPreKeyRecord signedPreKey,
            KyberPreKeyRecord kyberPreKey,
            List<Integer> preKeyIdsToWrite
    ) throws JSONException {
        JSONArray preKeyIds = new JSONArray();
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString("identity_key_pair", encode(identityKeyPair.serialize()));
        editor.putInt("registration_id", registrationId);
        editor.putInt("signed_prekey_id", signedPreKeyId);
        editor.putString("signed_prekey", encode(signedPreKey.serialize()));
        editor.putInt("kyber_prekey_id", kyberPreKeyId);
        editor.putString("kyber_prekey", encode(kyberPreKey.serialize()));

        for (int id : preKeyIdsToWrite) {
            try {
                PreKeyRecord record = protocolStore.loadPreKey(id);
                editor.putString(preKeyKey(id), encode(record.serialize()));
                preKeyIds.put(id);
            } catch (Exception e) {
                throw new JSONException("failed to persist prekey " + id + ": " + e.getMessage());
            }
        }
        editor.putString("prekey_ids", preKeyIds.toString());
        if (!editor.commit()) {
            throw new JSONException("failed to commit signal prekey material");
        }
    }

    private void loadPreKeysAndSessions() throws Exception {
        if (prefs.contains("signed_prekey")) {
            SignedPreKeyRecord signedPreKey = new SignedPreKeyRecord(decode(prefs.getString("signed_prekey", "")));
            protocolStore.storeSignedPreKey(signedPreKeyId, signedPreKey);
        }
        if (prefs.contains("kyber_prekey")) {
            KyberPreKeyRecord kyberPreKey = new KyberPreKeyRecord(decode(prefs.getString("kyber_prekey", "")));
            protocolStore.storeKyberPreKey(kyberPreKeyId, kyberPreKey);
        }
        String preKeyIdsRaw = prefs.getString("prekey_ids", "[]");
        JSONArray preKeyIds = new JSONArray(preKeyIdsRaw);
        for (int i = 0; i < preKeyIds.length(); i++) {
            int id = preKeyIds.getInt(i);
            String serialized = prefs.getString(preKeyKey(id), null);
            if (serialized != null) {
                protocolStore.storePreKey(id, new PreKeyRecord(decode(serialized)));
            }
        }
        Set<String> legacyPeers = prefs.getStringSet("session_peer_ids", new HashSet<>());
        for (String peerId : legacyPeers) {
            String serialized = prefs.getString(legacySessionKey(peerId), null);
            if (serialized == null) {
                continue;
            }
            SignalProtocolAddress address = new SignalProtocolAddress(peerId, 1);
            protocolStore.storeSession(address, new SessionRecord(decode(serialized)));
        }
        Set<String> peerAddrs = prefs.getStringSet("session_peer_addrs", new HashSet<>());
        for (String addr : peerAddrs) {
            String[] parts = splitSessionAddr(addr);
            if (parts == null) {
                continue;
            }
            String peerId = parts[0];
            int deviceId = Integer.parseInt(parts[1]);
            String serialized = prefs.getString(sessionKey(peerId, deviceId), null);
            if (serialized == null) {
                continue;
            }
            SignalProtocolAddress address = new SignalProtocolAddress(peerId, deviceId);
            protocolStore.storeSession(address, new SessionRecord(decode(serialized)));
        }
    }

    private void loadTrustedIdentities() throws Exception {
        for (String key : prefs.getAll().keySet()) {
            if (!key.startsWith("identity_")) {
                continue;
            }
            String addrRaw = key.substring("identity_".length());
            int colon = addrRaw.lastIndexOf(':');
            if (colon < 1) {
                continue;
            }
            String peerUserId = addrRaw.substring(0, colon);
            int deviceId = Integer.parseInt(addrRaw.substring(colon + 1));
            String serialized = prefs.getString(key, null);
            if (serialized == null) {
                continue;
            }
            SignalProtocolAddress address = new SignalProtocolAddress(peerUserId, deviceId);
            protocolStore.saveIdentity(address, new IdentityKey(decode(serialized)));
        }
    }

    public synchronized void persistPeerIdentity(String peerUserId, int deviceId, IdentityKey identity) {
        if (identity == null) {
            return;
        }
        if (!prefs.edit()
                .putString(identityKey(peerUserId, deviceId), encode(identity.serialize()))
                .commit()) {
            throw new RuntimeException("failed to persist peer identity");
        }
    }

    public synchronized void trackSessionPeer(String peerUserId, int peerDeviceId) throws JSONException {
        Set<String> addrs = loadSessionPeerAddrs();
        addrs.add(sessionAddr(peerUserId, peerDeviceId));
        if (!prefs.edit().putStringSet("session_peer_addrs", addrs).commit()) {
            throw new JSONException("failed to track session peer");
        }
        persistSessions();
    }

    public synchronized void trackSessionPeer(String peerUserId) throws JSONException {
        trackSessionPeer(peerUserId, 1);
    }

    @Override
    public void storeSenderKey(SignalProtocolAddress sender, UUID distributionId, SenderKeyRecord record) {
        prefs.edit()
                .putString(senderKeyKey(sender.getName(), distributionId), encode(record.serialize()))
                .apply();
    }

    @Override
    public SenderKeyRecord loadSenderKey(SignalProtocolAddress sender, UUID distributionId) {
        String raw = prefs.getString(senderKeyKey(sender.getName(), distributionId), null);
        if (raw == null) {
            return null;
        }
        try {
            return new SenderKeyRecord(decode(raw));
        } catch (Exception e) {
            return null;
        }
    }

    public boolean hasSenderKey(String senderUserId, UUID distributionId) {
        return loadSenderKey(new SignalProtocolAddress(senderUserId, 1), distributionId) != null;
    }

    public List<Integer> getPreKeyIds() throws JSONException {
        String raw = prefs.getString("prekey_ids", "[]");
        JSONArray arr = new JSONArray(raw);
        List<Integer> ids = new ArrayList<>();
        for (int i = 0; i < arr.length(); i++) {
            ids.add(arr.getInt(i));
        }
        return ids;
    }

    private static String sessionAddr(String peerId, int deviceId) {
        return peerId + ":" + deviceId;
    }

    private static String[] splitSessionAddr(String addr) {
        if (addr == null || addr.isEmpty()) {
            return null;
        }
        int colon = addr.lastIndexOf(':');
        if (colon < 1) {
            return null;
        }
        return new String[] { addr.substring(0, colon), addr.substring(colon + 1) };
    }

    private Set<String> loadSessionPeerAddrs() {
        Set<String> addrs = new HashSet<>(prefs.getStringSet("session_peer_addrs", new HashSet<>()));
        Set<String> legacyPeers = prefs.getStringSet("session_peer_ids", new HashSet<>());
        for (String peerId : legacyPeers) {
            addrs.add(sessionAddr(peerId, 1));
        }
        return addrs;
    }

    private static String sessionKey(String peerId, int deviceId) {
        return "session_" + peerId + ":" + deviceId;
    }

    private static String legacySessionKey(String peerId) {
        return "session_" + peerId;
    }

    private static String preKeyKey(int id) {
        return "prekey_" + id;
    }

    private static String identityKey(String peerUserId, int deviceId) {
        return "identity_" + peerUserId + ":" + deviceId;
    }

    private static String senderKeyKey(String senderId, UUID distributionId) {
        return "sender_key_" + senderId + "_" + distributionId.toString();
    }

    private static String encode(byte[] data) {
        return Base64.encodeToString(data, Base64.NO_WRAP);
    }

    private static byte[] decode(String data) {
        return Base64.decode(data, Base64.NO_WRAP);
    }

    /** Session + sender keys + peer identity trust for one peer device. */
    public synchronized void resetPeerSignalState(String peerUserId, int peerDeviceId) throws JSONException {
        deleteSessionForPeer(peerUserId, peerDeviceId);
        prefs.edit().remove(identityKey(peerUserId, peerDeviceId)).commit();
        SignalProtocolAddress address = new SignalProtocolAddress(peerUserId, peerDeviceId);
        if (protocolStore.containsSession(address)) {
            protocolStore.deleteSession(address);
        }
    }

    public synchronized void resetPeerSignalState(String peerUserId) throws JSONException {
        resetPeerSignalState(peerUserId, 1);
    }

    public synchronized void clearPeerIdentity(String peerUserId, int deviceId) throws Exception {
        prefs.edit().remove(identityKey(peerUserId, deviceId)).commit();
        reloadProtocolStoreFromDisk();
    }

    private synchronized void reloadProtocolStoreFromDisk() throws Exception {
        IdentityKeyPair identity;
        int registrationId;
        if (prefs.contains("identity_key_pair")) {
            identity = new IdentityKeyPair(decode(prefs.getString("identity_key_pair", "")));
            registrationId = prefs.getInt("registration_id", KeyHelper.generateRegistrationId(false));
        } else {
            identity = IdentityKeyPair.generate();
            registrationId = KeyHelper.generateRegistrationId(false);
        }
        protocolStore = new InMemorySignalProtocolStore(identity, registrationId);
        signedPreKeyId = prefs.getInt("signed_prekey_id", 1);
        kyberPreKeyId = prefs.getInt("kyber_prekey_id", 1);
        loadPreKeysAndSessions();
        loadTrustedIdentities();
    }

    /** Drop one peer session (and their sender keys) after remote identity rotation. */
    public synchronized void deleteSessionForPeer(String peerUserId, int peerDeviceId) throws JSONException {
        SharedPreferences.Editor editor = prefs.edit();
        editor.remove(sessionKey(peerUserId, peerDeviceId));
        editor.remove(legacySessionKey(peerUserId));
        SignalProtocolAddress address = new SignalProtocolAddress(peerUserId, peerDeviceId);
        if (protocolStore.containsSession(address)) {
            protocolStore.deleteSession(address);
        }
        Set<String> addrs = loadSessionPeerAddrs();
        addrs.remove(sessionAddr(peerUserId, peerDeviceId));
        editor.putStringSet("session_peer_addrs", addrs);
        editor.remove("session_peer_ids");
        if (peerDeviceId == 1) {
            List<String> senderKeys = new ArrayList<>();
            String prefix = "sender_key_" + peerUserId + "_";
            for (String key : prefs.getAll().keySet()) {
                if (key.startsWith(prefix)) {
                    senderKeys.add(key);
                }
            }
            for (String key : senderKeys) {
                editor.remove(key);
            }
        }
        if (!editor.commit()) {
            throw new JSONException("failed to delete peer session");
        }
    }

    public synchronized void deleteSessionForPeer(String peerUserId) throws JSONException {
        deleteSessionForPeer(peerUserId, 1);
    }

    /** Clear ratchet sessions after identity rotation — keep local identity keys. */
    public synchronized void clearAllSessions() throws JSONException {
        Set<String> addrs = loadSessionPeerAddrs();
        SharedPreferences.Editor editor = prefs.edit();
        for (String addr : addrs) {
            String[] parts = splitSessionAddr(addr);
            if (parts == null) {
                continue;
            }
            String peerId = parts[0];
            int deviceId = Integer.parseInt(parts[1]);
            editor.remove(sessionKey(peerId, deviceId));
            editor.remove(legacySessionKey(peerId));
            SignalProtocolAddress address = new SignalProtocolAddress(peerId, deviceId);
            if (protocolStore.containsSession(address)) {
                protocolStore.deleteSession(address);
            }
        }
        editor.remove("session_peer_addrs");
        editor.remove("session_peer_ids");
        java.util.List<String> senderKeys = new ArrayList<>();
        for (String key : prefs.getAll().keySet()) {
            if (key.startsWith("sender_key_")) {
                senderKeys.add(key);
            }
        }
        for (String key : senderKeys) {
            editor.remove(key);
        }
        if (!editor.commit()) {
            throw new JSONException("failed to clear signal sessions");
        }
    }

    public int getLocalDeviceId() {
        return Math.max(1, prefs.getInt("local_device_id", 1));
    }

    public void setLocalDeviceId(int deviceId) {
        int safe = Math.max(1, Math.min(5, deviceId));
        prefs.edit().putInt("local_device_id", safe).apply();
    }

    /** Panic wipe — clear local Signal material so X3DH can rebuild cleanly. */
    public static synchronized void wipeAll(Context context) {
        context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .clear()
                .commit();
        instance = null;
    }
}