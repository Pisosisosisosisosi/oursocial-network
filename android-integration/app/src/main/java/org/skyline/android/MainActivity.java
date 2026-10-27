package org.skyline.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;
import org.skyline.android.api.SkylineApiClient;
import org.skyline.android.api.SkylineRealtimeClient;
import org.skyline.android.api.SkylineCrypto;
import io.socket.emitter.Emitter;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final SkylineApiClient api = new SkylineApiClient();
    private SkylineCrypto crypto;
    private EditText emailInput;
    private EditText passwordInput;
    private TextView statusView;
    private Button loginButton;
    private ProgressBar progress;
    private LinearLayout root;
    private JSONObject currentUser;
    private String activeContactId;
    private String activeConversationTitle;
    private EditText activeMessageInput;
    private SkylineRealtimeClient realtime;
    private Emitter.Listener messageChangedListener;
    private boolean e2eeReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        crypto = new SkylineCrypto(this);
        renderLogin();
    }

    private void renderLogin() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        int horizontal = dp(28);
        root.setPadding(horizontal, dp(24), horizontal, dp(24));
        root.setBackgroundColor(0xFFF5F8FC);

        TextView logo = new TextView(this);
        logo.setText("Skyline");
        logo.setTextSize(34);
        logo.setTextColor(0xFF1877D2);
        logo.setGravity(Gravity.CENTER);
        root.addView(logo, matchWrap());

        TextView subtitle = new TextView(this);
        subtitle.setText("Войдите в свой аккаунт");
        subtitle.setTextSize(16);
        subtitle.setTextColor(0xFF586778);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleParams = matchWrap();
        subtitleParams.bottomMargin = dp(28);
        root.addView(subtitle, subtitleParams);

        emailInput = new EditText(this);
        emailInput.setSingleLine(true);
        emailInput.setInputType(33);
        emailInput.setHint("Электронная почта");
        root.addView(emailInput, matchWrap());

        passwordInput = new EditText(this);
        passwordInput.setSingleLine(true);
        passwordInput.setInputType(129);
        passwordInput.setHint("Пароль");
        LinearLayout.LayoutParams passwordParams = matchWrap();
        passwordParams.topMargin = dp(10);
        root.addView(passwordInput, passwordParams);

        loginButton = new Button(this);
        loginButton.setText("Войти");
        LinearLayout.LayoutParams buttonParams = matchWrap();
        buttonParams.topMargin = dp(18);
        root.addView(loginButton, buttonParams);

        progress = new ProgressBar(this);
        progress.setVisibility(View.GONE);
        LinearLayout.LayoutParams progressParams = new LinearLayout.LayoutParams(dp(36), dp(36));
        progressParams.gravity = Gravity.CENTER;
        progressParams.topMargin = dp(12);
        root.addView(progress, progressParams);

        statusView = new TextView(this);
        statusView.setText("Подключение к Skyline API");
        statusView.setTextSize(14);
        statusView.setTextColor(0xFF586778);
        statusView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusParams = matchWrap();
        statusParams.topMargin = dp(12);
        root.addView(statusView, statusParams);

        loginButton.setOnClickListener(v -> login());
        setContentView(root);
    }

    private void login() {
        String email = emailInput.getText().toString().trim();
        String password = passwordInput.getText().toString();
        if (email.isEmpty() || password.isEmpty()) {
            statusView.setText("Введите почту и пароль.");
            return;
        }
        setBusy(true);
        statusView.setText("Выполняется вход…");
        executor.execute(() -> {
            try {
                JSONObject response = api.login(email, password);
                JSONObject user = response.optJSONObject("user");
                if (user == null) throw new IllegalStateException("В ответе Skyline API отсутствуют данные пользователя");
                String publicKey = crypto.ensurePublicKey();
                boolean keyReady = false;
                String keyWarning = null;
                try {
                    JSONObject serverKey = api.getMyPublicKey();
                    keyReady = publicKey.equals(serverKey.optString("publicKey", ""));
                    if (!keyReady) {
                        keyWarning = "Ключ шифрования аккаунта уже зарегистрирован на другом устройстве. Вход выполнен, но отправка E2EE-сообщений отключена, чтобы не перезаписать ключ и не потерять доступ к старым сообщениям.";
                    }
                } catch (SkylineApiClient.SkylineApiException keyError) {
                    if (keyError.getStatusCode() == 404) {
                        api.uploadPublicKey(publicKey);
                        keyReady = true;
                    } else {
                        throw keyError;
                    }
                }
                JSONArray contacts = api.getContacts();
                final boolean cryptoReady = keyReady;
                final String cryptoWarning = keyWarning;
                runOnUiThread(() -> {
                    currentUser = user;
                    e2eeReady = cryptoReady;
                    connectRealtime();
                    renderContacts(contacts, cryptoWarning);
                });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось подключиться к API." : error.getMessage();
                runOnUiThread(() -> {
                    setBusy(false);
                    statusView.setText("Ошибка входа: " + message);
                });
            }
        });
    }

    private void renderContacts(JSONArray contacts, String errorText) {
        LinearLayout screen = createScreen();
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setOrientation(LinearLayout.HORIZONTAL);
        TextView title = text("Skyline", 25, 0xFF1877D2);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button refresh = new Button(this);
        refresh.setText("Обновить");
        refresh.setOnClickListener(v -> refreshContacts());
        header.addView(refresh);
        screen.addView(header, matchWrap());

        TextView account = text("Вы вошли как " + currentUser.optString("username", currentUser.optString("email", "")), 13, 0xFF586778);
        LinearLayout.LayoutParams accountParams = matchWrap();
        accountParams.topMargin = dp(4);
        accountParams.bottomMargin = dp(12);
        screen.addView(account, accountParams);

        if (errorText != null) screen.addView(text(errorText, 13, 0xFFB42318), matchWrap());
        ScrollView scroll = new ScrollView(this);
        LinearLayout list = new LinearLayout(this);
        list.setOrientation(LinearLayout.VERTICAL);
        if (contacts.length() == 0) {
            TextView empty = text("Пока нет личных чатов. Добавьте контакт в веб-версии Skyline.", 15, 0xFF586778);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(dp(12), dp(28), dp(12), dp(28));
            list.addView(empty, matchWrap());
        }
        for (int i = 0; i < contacts.length(); i++) {
            JSONObject contact = contacts.optJSONObject(i);
            if (contact == null) continue;
            final String id = contact.optString("id", "");
            if (id.isEmpty()) continue;
            String name = contact.optString("nickname", contact.optString("displayName", contact.optString("username", "Пользователь")));
            String preview = contact.optString("lastMessageText", "");
            if (!preview.isEmpty() && (preview.startsWith("skyline-e2e:") || preview.startsWith("oursocial-e2e:"))) {
                preview = "🔒 Зашифрованное сообщение";
            }
            if (preview.isEmpty()) preview = "Открыть переписку";
            TextView item = text(name + "\n@" + contact.optString("username", "") + "\n" + preview, 15, 0xFF263445);
            item.setPadding(dp(14), dp(14), dp(14), dp(14));
            item.setBackgroundColor(i % 2 == 0 ? 0xFFFFFFFF : 0xFFF0F4F8);
            item.setOnClickListener(v -> openConversation(id, name));
            list.addView(item, matchWrap());
        }
        scroll.addView(list);
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(-1, 0, 1);
        scrollParams.topMargin = dp(8);
        screen.addView(scroll, scrollParams);

        Button logout = new Button(this);
        logout.setText("Выйти");
        logout.setOnClickListener(v -> {
            disconnectRealtime();
            api.clearSession();
            currentUser = null;
            e2eeReady = false;
            activeContactId = null;
            activeConversationTitle = null;
            activeMessageInput = null;
            renderLogin();
        });
        screen.addView(logout, matchWrap());
        setContentView(screen);
        setBusy(false);
    }

    private void refreshContacts() {
        // Leaving the conversation screen must also clear the active chat reference;
        // otherwise realtime events can unexpectedly reopen a chat over the list.
        activeContactId = null;
        activeConversationTitle = null;
        activeMessageInput = null;
        setBusy(true);
        executor.execute(() -> {
            try {
                JSONArray contacts = api.getContacts();
                runOnUiThread(() -> renderContacts(contacts, null));
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось загрузить чаты." : error.getMessage();
                runOnUiThread(() -> renderContacts(new JSONArray(), "Ошибка загрузки чатов: " + message));
            }
        });
    }

    private void openConversation(String contactId, String title) {
        // Realtime refreshes rebuild the screen. Preserve the current draft when
        // refreshing the same conversation so incoming events don't erase typing.
        String draft = contactId.equals(activeContactId) && activeMessageInput != null
                ? activeMessageInput.getText().toString() : "";
        activeContactId = contactId;
        activeConversationTitle = title;
        LinearLayout screen = createScreen();
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = new Button(this);
        back.setText("‹ Назад");
        back.setOnClickListener(v -> refreshContacts());
        header.addView(back);
        TextView heading = text(title, 20, 0xFF1877D2);
        LinearLayout.LayoutParams headingParams = new LinearLayout.LayoutParams(0, -2, 1);
        headingParams.leftMargin = dp(8);
        header.addView(heading, headingParams);
        screen.addView(header, matchWrap());

        TextView notice = text("Сообщения шифруются на устройстве перед отправкой.", 12, 0xFF586778);
        LinearLayout.LayoutParams noticeParams = matchWrap();
        noticeParams.topMargin = dp(8);
        noticeParams.bottomMargin = dp(8);
        screen.addView(notice, noticeParams);

        TextView messagesView = text("Загрузка сообщений…", 14, 0xFF263445);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(messagesView);
        screen.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout composer = new LinearLayout(this);
        composer.setOrientation(LinearLayout.HORIZONTAL);
        composer.setGravity(Gravity.CENTER_VERTICAL);
        EditText messageInput = new EditText(this);
        activeMessageInput = messageInput;
        messageInput.setText(draft);
        messageInput.setHint("Сообщение…");
        messageInput.setMinLines(1);
        messageInput.setMaxLines(4);
        composer.addView(messageInput, new LinearLayout.LayoutParams(0, -2, 1));
        Button send = new Button(this);
        send.setText("Отправить");
        send.setOnClickListener(v -> sendMessage(contactId, title, messageInput, send));
        composer.addView(send);
        LinearLayout.LayoutParams composerParams = matchWrap();
        composerParams.topMargin = dp(6);
        screen.addView(composer, composerParams);

        setContentView(screen);
        setBusy(true);
        executor.execute(() -> {
            try {
                JSONArray messages = api.getMessages(contactId);
                StringBuilder history = new StringBuilder();
                for (int i = 0; i < messages.length(); i++) {
                    JSONObject message = messages.optJSONObject(i);
                    if (message == null) continue;
                    String currentUserId = currentUser == null ? "" : currentUser.optString("userId", currentUser.optString("id", ""));
                    boolean own = !currentUserId.isEmpty() && currentUserId.equals(message.optString("senderId", ""));
                    String sender = own ? "Вы" : title;
                    String body = message.optString("text", "");
                    if (body.startsWith("skyline-e2e:v4:")) {
                        try {
                            body = crypto.decryptMessage(body, currentUserId);
                        } catch (Exception decryptError) {
                            body = "🔒 Не удалось расшифровать сообщение на этом устройстве";
                        }
                    } else if (body.startsWith("skyline-e2e:") || body.startsWith("oursocial-e2e:")) {
                        body = "🔒 Сообщение использует старый формат шифрования, пока не поддерживаемый Android";
                    } else if (!"text".equals(message.optString("type", "text"))) {
                        body = "📎 Вложение";
                    }
                    if (history.length() > 0) history.append("\n\n");
                    history.append(sender).append("\n").append(body);
                }
                if (history.length() == 0) history.append("Сообщений пока нет.");
                final String rendered = history.toString();
                runOnUiThread(() -> {
                    if (contactId.equals(activeContactId)) {
                        messagesView.setText(rendered);
                        messagesView.setPadding(dp(8), dp(12), dp(8), dp(12));
                        setBusy(false);
                    }
                });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось загрузить историю." : error.getMessage();
                runOnUiThread(() -> {
                    messagesView.setText("Ошибка загрузки сообщений: " + message);
                    setBusy(false);
                });
            }
        });
    }

    private void sendMessage(String recipientId, String title, EditText input, Button sendButton) {
        String plainText = input.getText().toString().trim();
        if (plainText.isEmpty()) return;
        if (currentUser == null) return;
        if (!e2eeReady) {
            input.setError("E2EE-ключ этого аккаунта принадлежит другому устройству; безопасная синхронизация ключей ещё не реализована.");
            return;
        }
        String senderId = currentUser.optString("id", currentUser.optString("userId", ""));
        if (senderId.isEmpty()) {
            input.setError("Не удалось определить ваш аккаунт.");
            return;
        }
        sendButton.setEnabled(false);
        executor.execute(() -> {
            try {
                String ownPublicKey = crypto.ensurePublicKey();
                JSONObject recipientKey = api.getPublicKey(recipientId);
                String recipientPublicKey = recipientKey.optString("publicKey", "");
                if (recipientPublicKey.isEmpty()) throw new IllegalStateException("У собеседника ещё нет ключа шифрования. Попросите его войти в Skyline на устройстве.");
                String encrypted = crypto.encryptMessage(plainText, senderId, ownPublicKey, recipientId, recipientPublicKey);
                api.sendTextMessage(recipientId, encrypted);
                runOnUiThread(() -> {
                    input.setText("");
                    sendButton.setEnabled(true);
                    openConversation(recipientId, title);
                });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось отправить сообщение." : error.getMessage();
                runOnUiThread(() -> {
                    sendButton.setEnabled(true);
                    input.setError(message);
                });
            }
        });
    }

    private void connectRealtime() {
        disconnectRealtime();
        try {
            realtime = new SkylineRealtimeClient(SkylineApiClient.DEFAULT_BASE_URL, api.getAccessToken());
            messageChangedListener = args -> {
                if (args == null || args.length == 0 || !(args[0] instanceof JSONObject)) return;
                JSONObject event = (JSONObject) args[0];
                runOnUiThread(() -> {
                    if (currentUser == null) return;
                    String senderId = event.optString("senderId", "");
                    String receiverId = event.optString("receiverId", "");
                    String currentId = currentUser.optString("id", currentUser.optString("userId", ""));
                    if (activeContactId != null &&
                            (activeContactId.equals(senderId) || activeContactId.equals(receiverId))) {
                        openConversation(activeContactId, activeConversationTitle == null ? "Чат" : activeConversationTitle);
                    } else if (activeContactId == null &&
                            (!currentId.equals(senderId) || !receiverId.isEmpty())) {
                        refreshContacts();
                    }
                });
            };
            realtime.on("message_changed", messageChangedListener);
            realtime.connect();
        } catch (Exception error) {
            // REST chat/history remain available if the realtime endpoint is unavailable.
            realtime = null;
            messageChangedListener = null;
        }
    }

    private void disconnectRealtime() {
        if (realtime != null) {
            if (messageChangedListener != null) realtime.off("message_changed", messageChangedListener);
            realtime.disconnect();
            realtime = null;
        }
        messageChangedListener = null;
    }

    private LinearLayout createScreen() {
        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setPadding(dp(16), dp(18), dp(16), dp(12));
        screen.setBackgroundColor(0xFFF5F8FC);
        return screen;
    }

    private TextView text(String value, int size, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        return view;
    }

    private void setBusy(boolean busy) {
        if (loginButton != null) loginButton.setEnabled(!busy);
        if (progress != null) progress.setVisibility(busy ? View.VISIBLE : View.GONE);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onDestroy() {
        disconnectRealtime();
        executor.shutdownNow();
        super.onDestroy();
    }
}
