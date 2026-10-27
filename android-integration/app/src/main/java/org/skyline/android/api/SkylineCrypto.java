package org.skyline.android.api;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.security.spec.ECParameterSpec;
import java.security.AlgorithmParameters;
import java.util.Iterator;
import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.KeyGenerator;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Skyline v4 E2EE bridge. Private key material is encrypted at rest with an
 * Android Keystore AES key; the server receives only the public JWK.
 */
public final class SkylineCrypto {
    private static final String PREFIX = "skyline-e2e:v4:";
    private static final String KEY_ALIAS = "skyline.e2ee.storage.v1";
    private static final String PREFS = "skyline_e2ee";
    private static final String PRIVATE_KEY_PREF = "encrypted_private_pkcs8";
    private static final String PUBLIC_KEY_PREF = "public_jwk";
    private final Context context;

    public SkylineCrypto(Context context) { this.context = context.getApplicationContext(); }

    public synchronized String ensurePublicKey() throws Exception {
        SharedPreferences prefs = prefs();
        if (prefs.contains(PRIVATE_KEY_PREF) && prefs.contains(PUBLIC_KEY_PREF)) return prefs.getString(PUBLIC_KEY_PREF, "");
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair pair = generator.generateKeyPair();
        byte[] encrypted = encryptAtRest(pair.getPrivate().getEncoded());
        String publicJwk = encodePublicJwk(pair.getPublic());
        prefs.edit().putString(PRIVATE_KEY_PREF, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(PUBLIC_KEY_PREF, publicJwk).apply();
        return publicJwk;
    }

    public String encryptMessage(String plaintext, String ownUserId, String ownPublicJwk,
                                 String recipientUserId, String recipientPublicJwk) throws Exception {
        if (plaintext == null || plaintext.trim().isEmpty()) throw new IllegalArgumentException("Сообщение пустое");
        if (ownUserId == null || ownUserId.isEmpty() || recipientUserId == null || recipientUserId.isEmpty())
            throw new IllegalArgumentException("Не удалось определить участников чата");
        if (ownPublicJwk == null || ownPublicJwk.isEmpty() || recipientPublicJwk == null || recipientPublicJwk.isEmpty())
            throw new IllegalStateException("У одного из участников нет ключа шифрования");

        byte[] rawContentKey = new byte[32];
        byte[] payloadIv = randomBytes(12);
        new SecureRandom().nextBytes(rawContentKey);
        SecretKey contentKey = new SecretKeySpec(rawContentKey, "AES");
        byte[] ciphertext = aesEncrypt(contentKey, payloadIv, plaintext.getBytes(StandardCharsets.UTF_8));

        JSONObject recipients = new JSONObject();
        addRecipient(recipients, ownUserId, ownPublicJwk, rawContentKey);
        if (!ownUserId.equals(recipientUserId)) addRecipient(recipients, recipientUserId, recipientPublicJwk, rawContentKey);

        JSONObject envelope = new JSONObject();
        envelope.put("iv", b64(payloadIv));
        envelope.put("ciphertext", b64(ciphertext));
        envelope.put("recipients", recipients);
        java.util.Arrays.fill(rawContentKey, (byte) 0);
        return PREFIX + envelope;
    }

    /** Encrypts one payload for every member of a group; every recipient must be included. */
    public String encryptMessageForRecipients(String plaintext, JSONObject publicKeysByUserId) throws Exception {
        if (plaintext == null || plaintext.trim().isEmpty()) throw new IllegalArgumentException("Сообщение пустое");
        if (publicKeysByUserId == null || publicKeysByUserId.length() == 0)
            throw new IllegalArgumentException("В группе нет доступных ключей шифрования");
        byte[] rawContentKey = new byte[32];
        byte[] payloadIv = randomBytes(12);
        new SecureRandom().nextBytes(rawContentKey);
        SecretKey contentKey = new SecretKeySpec(rawContentKey, "AES");
        byte[] ciphertext = aesEncrypt(contentKey, payloadIv, plaintext.getBytes(StandardCharsets.UTF_8));
        JSONObject recipients = new JSONObject();
        Iterator<String> ids = publicKeysByUserId.keys();
        while (ids.hasNext()) {
            String userId = ids.next();
            String publicJwk = publicKeysByUserId.optString(userId, "");
            if (userId.trim().isEmpty() || publicJwk.isEmpty())
                throw new IllegalStateException("У каждого участника группы должен быть зарегистрирован ключ шифрования");
            addRecipient(recipients, userId, publicJwk, rawContentKey);
        }
        JSONObject envelope = new JSONObject();
        envelope.put("iv", b64(payloadIv));
        envelope.put("ciphertext", b64(ciphertext));
        envelope.put("recipients", recipients);
        java.util.Arrays.fill(rawContentKey, (byte) 0);
        return PREFIX + envelope;
    }

    public String decryptMessage(String encoded, String userId) throws Exception {
        if (encoded == null || !encoded.startsWith(PREFIX)) return encoded == null ? "" : encoded;
        JSONObject envelope = new JSONObject(encoded.substring(PREFIX.length()));
        JSONObject recipients = envelope.getJSONObject("recipients");
        JSONObject recipient = recipients.optJSONObject(userId);
        if (recipient == null) throw new IllegalStateException("Для этого аккаунта нет ключа расшифровки");
        PrivateKey privateKey = loadPrivateKey();
        PublicKey ephemeral = decodePublicJwk(recipient.getJSONObject("ephemeralPublicKey"));
        byte[] sharedSecret = agree(privateKey, ephemeral);
        byte[] salt = unb64(recipient.getString("salt"));
        byte[] wrappingKey = hkdf(sharedSecret, salt, ("skyline-e2e:v4:wrap:" + userId).getBytes(StandardCharsets.UTF_8), 32);
        byte[] rawContentKey = aesDecrypt(new SecretKeySpec(wrappingKey, "AES"), unb64(recipient.getString("iv")), unb64(recipient.getString("wrappedKey")));
        byte[] plaintext = aesDecrypt(new SecretKeySpec(rawContentKey, "AES"), unb64(envelope.getString("iv")), unb64(envelope.getString("ciphertext")));
        java.util.Arrays.fill(rawContentKey, (byte) 0);
        java.util.Arrays.fill(sharedSecret, (byte) 0);
        return new String(plaintext, StandardCharsets.UTF_8);
    }

    private void addRecipient(JSONObject recipients, String userId, String publicJwk, byte[] rawContentKey) throws Exception {
        PublicKey recipientPublic = decodePublicJwk(new JSONObject(publicJwk));
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair ephemeral = generator.generateKeyPair();
        byte[] sharedSecret = agree(ephemeral.getPrivate(), recipientPublic);
        byte[] salt = randomBytes(16);
        byte[] wrapIv = randomBytes(12);
        byte[] wrappingKey = hkdf(sharedSecret, salt, ("skyline-e2e:v4:wrap:" + userId).getBytes(StandardCharsets.UTF_8), 32);
        byte[] wrappedKey = aesEncrypt(new SecretKeySpec(wrappingKey, "AES"), wrapIv, rawContentKey);
        JSONObject recipient = new JSONObject();
        recipient.put("ephemeralPublicKey", new JSONObject(encodePublicJwk(ephemeral.getPublic())));
        recipient.put("salt", b64(salt));
        recipient.put("iv", b64(wrapIv));
        recipient.put("wrappedKey", b64(wrappedKey));
        recipients.put(userId, recipient);
        java.util.Arrays.fill(sharedSecret, (byte) 0);
    }

    public String protectLocalSecret(String value) throws Exception {
        if (value == null) return "";
        return Base64.encodeToString(encryptAtRest(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
    }

    public String unprotectLocalSecret(String value) throws Exception {
        if (value == null || value.isEmpty()) return "";
        byte[] packed = Base64.decode(value, Base64.NO_WRAP);
        return new String(decryptAtRest(packed), StandardCharsets.UTF_8);
    }

    private PrivateKey loadPrivateKey() throws Exception {
        String stored = prefs().getString(PRIVATE_KEY_PREF, null);
        if (stored == null) throw new IllegalStateException("Ключ шифрования не создан на этом устройстве");
        byte[] pkcs8 = decryptAtRest(Base64.decode(stored, Base64.NO_WRAP));
        return KeyFactory.getInstance("EC").generatePrivate(new java.security.spec.PKCS8EncodedKeySpec(pkcs8));
    }

    private String encodePublicJwk(PublicKey publicKey) throws Exception {
        java.security.interfaces.ECPublicKey ec = (java.security.interfaces.ECPublicKey) publicKey;
        JSONObject jwk = new JSONObject();
        jwk.put("kty", "EC"); jwk.put("crv", "P-256");
        jwk.put("x", b64Url(unsignedFixed(ec.getW().getAffineX(), 32)));
        jwk.put("y", b64Url(unsignedFixed(ec.getW().getAffineY(), 32)));
        return jwk.toString();
    }

    private PublicKey decodePublicJwk(JSONObject jwk) throws Exception {
        if (!"EC".equals(jwk.optString("kty")) || !"P-256".equals(jwk.optString("crv")))
            throw new IllegalArgumentException("Неподдерживаемый публичный ключ");
        AlgorithmParameters parameters = AlgorithmParameters.getInstance("EC");
        parameters.init(new ECGenParameterSpec("secp256r1"));
        ECParameterSpec spec = parameters.getParameterSpec(ECParameterSpec.class);
        BigInteger x = new BigInteger(1, Base64.decode(jwk.getString("x"), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING));
        BigInteger y = new BigInteger(1, Base64.decode(jwk.getString("y"), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING));
        return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(x, y), spec));
    }

    private byte[] agree(PrivateKey privateKey, PublicKey publicKey) throws Exception {
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(privateKey); agreement.doPhase(publicKey, true);
        return agreement.generateSecret();
    }

    private byte[] hkdf(byte[] ikm, byte[] salt, byte[] info, int length) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        byte[] output = new byte[length], previous = new byte[0];
        int offset = 0, counter = 1;
        while (offset < length) {
            mac.init(new SecretKeySpec(prk, "HmacSHA256"));
            mac.update(previous); mac.update(info); mac.update((byte) counter++);
            previous = mac.doFinal();
            int count = Math.min(previous.length, length - offset);
            System.arraycopy(previous, 0, output, offset, count); offset += count;
        }
        java.util.Arrays.fill(prk, (byte) 0);
        return output;
    }

    private byte[] aesEncrypt(SecretKey key, byte[] iv, byte[] clear) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
        return cipher.doFinal(clear);
    }
    private byte[] aesDecrypt(SecretKey key, byte[] iv, byte[] encrypted) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
        return cipher.doFinal(encrypted);
    }

    private byte[] encryptAtRest(byte[] clear) throws Exception {
        SecretKey key = storageKey();
        byte[] iv = randomBytes(12);
        byte[] encrypted = aesEncrypt(key, iv, clear);
        byte[] packed = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, packed, 0, iv.length);
        System.arraycopy(encrypted, 0, packed, iv.length, encrypted.length);
        return packed;
    }
    private byte[] decryptAtRest(byte[] packed) throws Exception {
        if (packed.length < 29) throw new IllegalStateException("Локальный ключ повреждён");
        byte[] iv = java.util.Arrays.copyOfRange(packed, 0, 12);
        byte[] encrypted = java.util.Arrays.copyOfRange(packed, 12, packed.length);
        return aesDecrypt(storageKey(), iv, encrypted);
    }
    private SecretKey storageKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        java.security.Key key = store.getKey(KEY_ALIAS, null);
        if (key instanceof SecretKey) return (SecretKey) key;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setRandomizedEncryptionRequired(true).build());
        return generator.generateKey();
    }

    private SharedPreferences prefs() { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static byte[] randomBytes(int count) { byte[] bytes = new byte[count]; new SecureRandom().nextBytes(bytes); return bytes; }
    private static String b64(byte[] bytes) { return Base64.encodeToString(bytes, Base64.NO_WRAP); }
    private static byte[] unb64(String value) { return Base64.decode(value, Base64.NO_WRAP); }
    private static String b64Url(byte[] bytes) { return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING); }
    private static byte[] unsignedFixed(BigInteger value, int size) {
        byte[] raw = value.toByteArray();
        int start = raw.length > size ? raw.length - size : 0;
        int length = Math.min(size, raw.length);
        byte[] fixed = new byte[size];
        System.arraycopy(raw, start, fixed, size - length, length);
        return fixed;
    }
}
