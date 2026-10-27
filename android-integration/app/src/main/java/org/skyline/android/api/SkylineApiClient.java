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
        return request("GET", "/users/search?q=" + encoded, null, true).optJSONArray("items");
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
