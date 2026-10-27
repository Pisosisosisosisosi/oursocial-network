package org.skyline.android.api;

import org.json.JSONObject;

import java.net.URLEncoder;
import java.util.Collections;
import java.util.Map;

import io.socket.client.IO;
import io.socket.client.Socket;
import io.socket.emitter.Emitter;

/**
 * Socket.IO adapter for Skyline realtime events.
 * Call connect/disconnect from lifecycle-aware code and only after login.
 */
public final class SkylineRealtimeClient {
    private final Socket socket;

    public SkylineRealtimeClient(String baseUrl, String token) throws Exception {
        if (baseUrl == null || baseUrl.trim().isEmpty()) {
            throw new IllegalArgumentException("Skyline Socket.IO URL is required");
        }
        if (token == null || token.trim().isEmpty()) {
            throw new IllegalArgumentException("A Skyline access token is required");
        }
        IO.Options options = IO.Options.builder()
                .setAuth(Collections.<String, String>singletonMap("token", token))
                .setReconnection(true)
                .setReconnectionAttempts(Integer.MAX_VALUE)
                .setReconnectionDelay(1000)
                .setReconnectionDelayMax(10000)
                .build();
        socket = IO.socket(trimTrailingSlash(baseUrl), options);
    }

    public void connect() { socket.connect(); }
    public void disconnect() { socket.disconnect(); }
    public boolean isConnected() { return socket.connected(); }

    public void on(String event, Emitter.Listener listener) {
        socket.on(event, listener);
    }

    public void off(String event, Emitter.Listener listener) {
        socket.off(event, listener);
    }

    public void joinChat(String chatId) {
        if (chatId == null || chatId.trim().isEmpty()) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("chatId", chatId);
            socket.emit("join_chat", payload);
        } catch (Exception ignored) {
            // JSONObject.put can only fail for invalid JSON values; chatId is a string.
        }
    }

    public void leaveChat(String chatId) {
        if (chatId == null || chatId.trim().isEmpty()) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("chatId", chatId);
            socket.emit("leave_chat", payload);
        } catch (Exception ignored) {
            // JSONObject.put can only fail for invalid JSON values; chatId is a string.
        }
    }

    public void setTyping(String recipientId, boolean typing) {
        if (recipientId == null || recipientId.trim().isEmpty()) return;
        JSONObject payload = new JSONObject();
        try {
            payload.put("recipientId", recipientId);
            payload.put("isTyping", typing);
            socket.emit("typing", payload);
        } catch (Exception ignored) {
            // JSONObject.put can only fail for invalid JSON values; values above are JSON-safe.
        }
    }

    public void emit(String event, JSONObject payload) {
        if (event == null || event.trim().isEmpty()) return;
        socket.emit(event, payload == null ? new JSONObject() : payload);
    }

    private static String trimTrailingSlash(String value) {
        int end = value.length();
        while (end > 0 && value.charAt(end - 1) == '/') end--;
        return value.substring(0, end);
    }
}
