package org.skyline.android.api;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class SkylineApiClient {
    public static final String DEFAULT_BASE_URL = "https://oursocial-python.onrender.com";
    private final String baseUrl;
    private volatile String accessToken;

    public SkylineApiClient() { this(DEFAULT_BASE_URL); }

    public SkylineApiClient(String baseUrl) {
        if (baseUrl == null || baseUrl.trim().isEmpty()) throw new IllegalArgumentException("Skyline API base URL is required");
        this.baseUrl = trimTrailingSlash(baseUrl.trim());
    }

    public void setAccessToken(String token) {
        accessToken = token == null || token.trim().isEmpty() ? null : token.trim();
    }
    public String getAccessToken() { return accessToken; }
    public void clearSession() { accessToken = null; }

    public JSONObject sendEmailCode(String email) throws Exception {
        JSONObject body = new JSONObject();
        body.put("email", email);
        return request("POST", "/auth/send-email-code", body, false);
    }

    public JSONObject verifyEmailCode(String email, String code) throws Exception {
        JSONObject body = new JSONObject();
        body.put("email", email);
        body.put("code", code);
        return request("POST", "/auth/verify-email-code", body, false);
    }

    public JSONObject sendPhoneCode(String phone) throws Exception {
        JSONObject body = new JSONObject();
        body.put("phone", phone);
        return request("POST", "/auth/phone/send-code", body, false);
    }

    public JSONObject verifyPhoneCode(String phone, String code) throws Exception {
        JSONObject body = new JSONObject();
        body.put("phone", phone);
        body.put("code", code);
        return request("POST", "/auth/phone/verify-code", body, false);
    }

    /** Registers in the same shared Skyline account store used by the web client. */
    public JSONObject register(String email, String password, String username) throws Exception {
        JSONObject body = new JSONObject();
        body.put("email", email);
        body.put("password", password);
        body.put("username", username);
        return request("POST", "/auth/register", body, false);
    }

    public JSONObject login(String email, String password) throws Exception {
        JSONObject body = new JSONObject();
        body.put("email", email);
        body.put("password", password);
        JSONObject response = request("POST", "/auth/login", body, false);
        String token = response.optString("token", "");
        if (token.isEmpty()) throw new IllegalStateException("Skyline login response did not include a token");
        setAccessToken(token);
        return response;
    }

    public JSONObject getCurrentUser() throws Exception {
        return request("GET", "/auth/me", null, true);
    }

    public JSONArray searchUsers(String query) throws Exception {
        String encoded = java.net.URLEncoder.encode(query == null ? "" : query, "UTF-8");
        JSONArray items = request("GET", "/users/search?q=" + encoded, null, true).optJSONArray("items");
        return items == null ? new JSONArray() : items;
    }

    public JSONObject getMyPublicKey() throws Exception {
        return request("GET", "/keys/me", null, true);
    }

    public JSONObject getPublicKey(String userId) throws Exception {
        return request("GET", "/keys/" + java.net.URLEncoder.encode(userId, "UTF-8"), null, true);
    }

    public void uploadPublicKey(String publicKey) throws Exception {
        JSONObject body = new JSONObject();
        body.put("publicKey", publicKey);
        request("POST", "/keys/upload", body, true);
    }

    public JSONObject sendTextMessage(String receiverId, String encryptedText) throws Exception {
        JSONObject body = new JSONObject();
        body.put("receiverId", receiverId);
        body.put("text", encryptedText);
        body.put("type", "text");
        return request("POST", "/messages", body, true);
    }

    /** Sends an encrypted attachment envelope; clear media data is never sent to the API. */
    public JSONObject sendAttachment(String receiverId, String type, String encryptedPayload) throws Exception {
        if (!"image".equals(type) && !"file".equals(type)) throw new IllegalArgumentException("Unsupported attachment type");
        if (encryptedPayload == null || !encryptedPayload.startsWith("skyline-e2e:v4:")) {
            throw new IllegalArgumentException("Attachment must be encrypted with Skyline E2EE v4");
        }
        JSONObject body = new JSONObject();
        body.put("receiverId", receiverId);
        body.put("text", "");
        body.put("type", type);
        body.put("fileData", encryptedPayload);
        return request("POST", "/messages", body, true);
    }

    public void addContact(String userId, String nickname) throws Exception {
        if (userId == null || userId.trim().isEmpty()) throw new IllegalArgumentException("A user ID is required");
        JSONObject body = new JSONObject();
        body.put("userId", userId);
        String safeNickname = nickname == null || nickname.trim().isEmpty() ? "Пользователь" : nickname.trim();
        if (safeNickname.length() > 40) safeNickname = safeNickname.substring(0, 40);
        body.put("nickname", safeNickname);
        request("PUT", "/contacts", body, true);
    }

    /** Returns the current user's personal chats, including recent-message previews. */
    public JSONArray getContacts() throws Exception {
        JSONObject response = request("GET", "/contacts", null, true);
        // Skyline's FastAPI endpoint returns a JSON array directly, while compatible
        // deployments may wrap the collection in an object.
        JSONArray items = response.optJSONArray("items");
        if (items == null) items = response.optJSONArray("contacts");
        return items == null ? new JSONArray() : items;
    }

    /** Loads the newest messages for a personal conversation. */
    public JSONArray getMessages(String otherUserId) throws Exception {
        if (otherUserId == null || otherUserId.trim().isEmpty()) {
            throw new IllegalArgumentException("A conversation user ID is required");
        }
        String encoded = java.net.URLEncoder.encode(otherUserId, "UTF-8");
        JSONArray items = request("GET", "/messages/" + encoded + "?limit=50", null, true).optJSONArray("items");
        return items == null ? new JSONArray() : items;
    }

    public JSONArray getGroups() throws Exception {
        return getArray("/groups");
    }

    public JSONObject createGroup(String title, String description, JSONArray memberIds) throws Exception {
        JSONObject body = new JSONObject();
        body.put("title", title);
        body.put("description", description == null ? "" : description);
        body.put("memberIds", memberIds == null ? new JSONArray() : memberIds);
        return request("POST", "/groups", body, true);
    }

    public JSONObject sendGroupMessage(String groupId, String encryptedText) throws Exception {
        JSONObject body = new JSONObject();
        body.put("text", encryptedText);
        body.put("type", "text");
        body.put("mentionUserIds", new JSONArray());
        return request("POST", "/groups/" + java.net.URLEncoder.encode(groupId, "UTF-8") + "/messages", body, true);
    }

    public JSONArray getGroupMessages(String groupId) throws Exception {
        return getArray("/groups/" + java.net.URLEncoder.encode(groupId, "UTF-8") + "/messages?limit=50");
    }

    public JSONArray getChannels() throws Exception {
        return getArray("/channels/");
    }

    public JSONObject createChannel(String title, String description, String visibility) throws Exception {
        JSONObject body = new JSONObject();
        body.put("title", title);
        body.put("description", description == null ? "" : description);
        body.put("visibility", "private".equals(visibility) ? "private" : "public");
        return request("POST", "/channels/", body, true);
    }

    public JSONArray getChannelPosts(String channelId) throws Exception {
        return getArray("/channels/" + java.net.URLEncoder.encode(channelId, "UTF-8") + "/posts?limit=50");
    }

    public JSONObject createChannelPost(String channelId, String text) throws Exception {
        JSONObject body = new JSONObject();
        body.put("text", text);
        return request("POST", "/channels/" + java.net.URLEncoder.encode(channelId, "UTF-8") + "/posts", body, true);
    }

    public JSONArray getStories() throws Exception {
        JSONArray stories = request("GET", "/stories", null, true).optJSONArray("stories");
        return stories == null ? new JSONArray() : stories;
    }

    public JSONObject createStory(String mediaType, String mediaData, String caption) throws Exception {
        JSONObject body = new JSONObject();
        body.put("mediaType", mediaType);
        body.put("mediaData", mediaData);
        body.put("caption", caption == null ? "" : caption);
        return request("POST", "/stories", body, true);
    }

    public void viewStory(String storyId) throws Exception {
        request("POST", "/stories/" + java.net.URLEncoder.encode(storyId, "UTF-8") + "/view", new JSONObject(), true);
    }

    public JSONArray getSavedMessages() throws Exception {
        JSONArray items = request("GET", "/saved-messages?limit=50", null, true).optJSONArray("items");
        return items == null ? new JSONArray() : items;
    }

    public JSONArray getScheduledMessages() throws Exception {
        JSONArray items = request("GET", "/scheduled-messages", null, true).optJSONArray("items");
        return items == null ? new JSONArray() : items;
    }

    public JSONObject getSettings() throws Exception {
        return request("GET", "/settings", null, true);
    }

    public void saveSettings(JSONObject settings) throws Exception {
        request("POST", "/settings", settings == null ? new JSONObject() : settings, true);
    }

    private JSONArray getArray(String path) throws Exception {
        JSONObject response = request("GET", path, null, true);
        JSONArray items = response.optJSONArray("items");
        return items == null ? new JSONArray() : items;
    }

    public void reactToMessage(String messageId, String emoji) throws Exception {
        JSONObject body = new JSONObject();
        body.put("emoji", emoji);
        request("POST", "/messages/" + java.net.URLEncoder.encode(messageId, "UTF-8") + "/reactions", body, true);
    }

    public void pinMessage(String messageId, boolean pinned) throws Exception {
        JSONObject body = new JSONObject();
        body.put("pinned", pinned);
        request("POST", "/messages/" + java.net.URLEncoder.encode(messageId, "UTF-8") + "/pin", body, true);
    }

    public void deleteMessageForAll(String messageId) throws Exception {
        request("POST", "/messages/" + java.net.URLEncoder.encode(messageId, "UTF-8") + "/delete-for-all", new JSONObject(), true);
    }

    public void saveMessage(String messageId) throws Exception {
        JSONObject body = new JSONObject();
        body.put("messageId", messageId);
        request("POST", "/saved-messages", body, true);
    }

    public void replyToMessage(String messageId, String encryptedText) throws Exception {
        JSONObject body = new JSONObject();
        body.put("text", encryptedText);
        body.put("type", "text");
        request("POST", "/messages/" + java.net.URLEncoder.encode(messageId, "UTF-8") + "/reply", body, true);
    }

    public JSONObject request(String method, String path, JSONObject body, boolean authenticated) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(baseUrl + (path.startsWith("/") ? path : "/" + path));
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            }
            String token = accessToken;
            if (authenticated && token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            String responseText = readFully(stream);
            if (status < 200 || status >= 300) throw new SkylineApiException(status, responseText);
            if (responseText.trim().isEmpty()) return new JSONObject();
            String trimmed = responseText.trim();
            if (trimmed.startsWith("{")) return new JSONObject(trimmed);
            if (trimmed.startsWith("[")) {
                JSONObject wrapped = new JSONObject();
                wrapped.put("items", new JSONArray(trimmed));
                return wrapped;
            }
            JSONObject wrapped = new JSONObject();
            wrapped.put("value", trimmed);
            return wrapped;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readFully(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }
    private static String trimTrailingSlash(String value) {
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == '/') end--;
        return value.substring(0, end);
    }

    public static final class SkylineApiException extends Exception {
        private final int statusCode;
        private final String responseBody;
        SkylineApiException(int statusCode, String responseBody) {
            super("Skyline API request failed with HTTP " + statusCode);
            this.statusCode = statusCode;
            this.responseBody = responseBody == null ? "" : responseBody;
        }
        public int getStatusCode() { return statusCode; }
        public String getResponseBody() { return responseBody; }
    }
}
