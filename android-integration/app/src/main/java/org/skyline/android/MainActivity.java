package org.skyline.android;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;
import android.text.Editable;
import android.text.TextWatcher;

import org.json.JSONArray;
import org.json.JSONObject;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import org.skyline.android.api.SkylineApiClient;
import org.skyline.android.api.SkylineRealtimeClient;
import org.skyline.android.api.SkylineCrypto;
import io.socket.emitter.Emitter;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final int PICK_STORY_IMAGE = 901;
    private static final int PICK_CHAT_IMAGE = 902;
    private String pendingStoryCaption = "";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final SkylineApiClient api = new SkylineApiClient();
    private SkylineCrypto crypto;
    private EditText emailInput;
    private EditText passwordInput;
    private EditText registerUsernameInput;
    private EditText registerPhoneInput;
    private EditText emailCodeInput;
    private EditText phoneCodeInput;
    private String emailRegistrationToken;
    private String phoneRegistrationToken;
    private TextView statusView;
    private Button loginButton;
    private ProgressBar progress;
    private LinearLayout root;
    private JSONObject currentUser;
    private String activeContactId;
    private String activeConversationTitle;
    private String activeGroupId;
    private JSONObject activeGroup;
    private EditText activeMessageInput;
    private LinearLayout searchResultsContainer;
    private ScrollView searchResultsScroll;
    private SkylineRealtimeClient realtime;
    private Emitter.Listener messageChangedListener;
    private Emitter.Listener typingListener;
    private TextView typingStatusView;
    private final Handler typingHandler = new Handler(Looper.getMainLooper());
    private Runnable typingStopRunnable;
    private boolean isTypingToContact;
    private boolean e2eeReady;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        crypto = new SkylineCrypto(this);
        renderLogin();
        restoreSession();
    }

    private void restoreSession() {
        String encryptedToken = getSharedPreferences("skyline_session", MODE_PRIVATE).getString("encrypted_token", "");
        if (encryptedToken == null || encryptedToken.isEmpty()) return;
        try {
            String token = crypto.unprotectLocalSecret(encryptedToken);
            if (token.isEmpty()) return;
            api.setAccessToken(token);
            setBusy(true);
            if (statusView != null) statusView.setText("Восстановление защищённой сессии…");
            executor.execute(() -> {
                try {
                    JSONObject user = api.getCurrentUser();
                    String publicKey = crypto.ensurePublicKey();
                    boolean keyReady = false;
                    String warning = null;
                    try {
                        JSONObject serverKey = api.getMyPublicKey();
                        keyReady = publicKey.equals(serverKey.optString("publicKey", ""));
                        if (!keyReady) warning = "Ключ аккаунта отличается от ключа устройства. Отправка E2EE отключена.";
                    } catch (SkylineApiClient.SkylineApiException keyError) {
                        if (keyError.getStatusCode() == 404) {
                            api.uploadPublicKey(publicKey);
                            keyReady = true;
                        } else throw keyError;
                    }
                    JSONArray contacts = api.getContacts();
                    final boolean cryptoReady = keyReady;
                    final String cryptoWarning = warning;
                    runOnUiThread(() -> {
                        currentUser = user;
                        e2eeReady = cryptoReady;
                        connectRealtime();
                        renderContacts(contacts, cryptoWarning);
                    });
                } catch (Exception error) {
                    api.clearSession();
                    getSharedPreferences("skyline_session", MODE_PRIVATE).edit().remove("encrypted_token").apply();
                    String message = error.getMessage() == null ? "Сохранённая сессия истекла." : error.getMessage();
                    runOnUiThread(() -> {
                        setBusy(false);
                        if (statusView != null) statusView.setText("Войдите снова: " + message);
                    });
                }
            });
        } catch (Exception error) {
            getSharedPreferences("skyline_session", MODE_PRIVATE).edit().remove("encrypted_token").apply();
        }
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
        Button registerButton = new Button(this);
        registerButton.setText("Создать аккаунт");
        LinearLayout.LayoutParams registerParams = matchWrap();
        registerParams.topMargin = dp(6);
        root.addView(registerButton, registerParams);
        registerButton.setOnClickListener(v -> renderRegister());
        setContentView(root);
    }

    private void renderRegister() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24), dp(20), dp(24), dp(20));
        root.setBackgroundColor(0xFFF5F8FC);

        TextView title = text("Регистрация Skyline", 28, 0xFF1877D2);
        title.setGravity(Gravity.CENTER);
        root.addView(title, matchWrap());
        TextView subtitle = text("Подтвердите электронную почту и номер телефона", 14, 0xFF586778);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subParams = matchWrap();
        subParams.topMargin = dp(6);
        subParams.bottomMargin = dp(12);
        root.addView(subtitle, subParams);

        ScrollView scroll = new ScrollView(this);
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(fields);
        registerUsernameInput = addRegistrationField(fields, "Имя пользователя (латиница)", 33);
        emailInput = addRegistrationField(fields, "Электронная почта", 33);
        passwordInput = addRegistrationField(fields, "Пароль (не менее 6 символов)", 129);
        registerPhoneInput = addRegistrationField(fields, "Телефон, например +373...", 3);
        emailCodeInput = addRegistrationField(fields, "Код из письма", 2);
        phoneCodeInput = addRegistrationField(fields, "Код из SMS", 2);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        Button sendEmail = new Button(this);
        sendEmail.setText("Отправить код на почту");
        fields.addView(sendEmail, matchWrap());
        sendEmail.setOnClickListener(v -> sendRegistrationEmailCode());

        Button verifyEmail = new Button(this);
        verifyEmail.setText("Подтвердить почту");
        fields.addView(verifyEmail, matchWrap());
        verifyEmail.setOnClickListener(v -> verifyRegistrationEmailCode());

        Button sendPhone = new Button(this);
        sendPhone.setText("Отправить SMS-код");
        fields.addView(sendPhone, matchWrap());
        sendPhone.setOnClickListener(v -> sendRegistrationPhoneCode());

        Button verifyPhone = new Button(this);
        verifyPhone.setText("Подтвердить телефон");
        fields.addView(verifyPhone, matchWrap());
        verifyPhone.setOnClickListener(v -> verifyRegistrationPhoneCode());

        Button create = new Button(this);
        create.setText("Зарегистрироваться");
        fields.addView(create, matchWrap());
        create.setOnClickListener(v -> completeRegistration());

        Button back = new Button(this);
        back.setText("Назад ко входу");
        fields.addView(back, matchWrap());
        back.setOnClickListener(v -> renderLogin());

        statusView = new TextView(this);
        statusView.setText("Для регистрации нужны подтверждённые email и телефон.");
        statusView.setTextColor(0xFF586778);
        statusView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusParams = matchWrap();
        statusParams.topMargin = dp(8);
        root.addView(statusView, statusParams);
        setContentView(root);
    }

    private EditText addRegistrationField(LinearLayout parent, String hint, int inputType) {
        EditText field = new EditText(this);
        field.setSingleLine(true);
        field.setInputType(inputType);
        field.setHint(hint);
        LinearLayout.LayoutParams params = matchWrap();
        params.topMargin = dp(4);
        params.bottomMargin = dp(4);
        parent.addView(field, params);
        return field;
    }

    private void sendRegistrationEmailCode() {
        String email = emailInput.getText().toString().trim();
        if (email.isEmpty()) { statusView.setText("Введите электронную почту."); return; }
        setBusy(true);
        statusView.setText("Отправляем письмо…");
        executor.execute(() -> {
            try {
                api.sendEmailCode(email);
                runOnUiThread(() -> { setBusy(false); statusView.setText("Письмо отправлено. Проверьте входящие и спам."); });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось отправить письмо." : error.getMessage();
                runOnUiThread(() -> { setBusy(false); statusView.setText("Ошибка: " + message); });
            }
        });
    }

    private void verifyRegistrationEmailCode() {
        String email = emailInput.getText().toString().trim();
        String code = emailCodeInput.getText().toString().trim();
        if (email.isEmpty() || code.isEmpty()) { statusView.setText("Введите email и код из письма."); return; }
        setBusy(true);
        statusView.setText("Проверяем email…");
        executor.execute(() -> {
            try {
                JSONObject response = api.verifyEmailCode(email, code);
                String token = response.optString("registrationToken", "");
                if (token.isEmpty()) throw new IllegalStateException("API не вернул токен подтверждения email.");
                emailRegistrationToken = token;
                runOnUiThread(() -> { setBusy(false); statusView.setText("Email подтверждён."); });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось подтвердить email." : error.getMessage();
                runOnUiThread(() -> { setBusy(false); statusView.setText("Ошибка: " + message); });
            }
        });
    }

    private void sendRegistrationPhoneCode() {
        String phone = registerPhoneInput.getText().toString().trim();
        if (phone.isEmpty()) { statusView.setText("Введите номер в международном формате."); return; }
        setBusy(true);
        statusView.setText("Запрашиваем SMS…");
        executor.execute(() -> {
            try {
                api.sendPhoneCode(phone);
                runOnUiThread(() -> { setBusy(false); statusView.setText("Если номер доступен для регистрации, SMS будет отправлено."); });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось отправить SMS." : error.getMessage();
                runOnUiThread(() -> { setBusy(false); statusView.setText("Ошибка SMS: " + message); });
            }
        });
    }

    private void verifyRegistrationPhoneCode() {
        String phone = registerPhoneInput.getText().toString().trim();
        String code = phoneCodeInput.getText().toString().trim();
        if (phone.isEmpty() || code.isEmpty()) { statusView.setText("Введите телефон и код из SMS."); return; }
        setBusy(true);
        statusView.setText("Проверяем телефон…");
        executor.execute(() -> {
            try {
                JSONObject response = api.verifyPhoneCode(phone, code);
                String token = response.optString("phoneVerificationToken", "");
                if (token.isEmpty()) throw new IllegalStateException("API не вернул токен подтверждения телефона.");
                phoneRegistrationToken = token;
                runOnUiThread(() -> { setBusy(false); statusView.setText("Телефон подтверждён."); });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось подтвердить телефон." : error.getMessage();
                runOnUiThread(() -> { setBusy(false); statusView.setText("Ошибка SMS: " + message); });
            }
        });
    }

    private void completeRegistration() {
        String username = registerUsernameInput.getText().toString().trim();
        String email = emailInput.getText().toString().trim();
        String password = passwordInput.getText().toString();
        String phone = registerPhoneInput.getText().toString().trim();
        if (!username.matches("[A-Za-z0-9_.-]{3,32}")) {
            statusView.setText("Имя пользователя: 3–32 символа, латиница, цифры, точка, дефис или подчёркивание."); return;
        }
        if (password.length() < 6) { statusView.setText("Пароль должен содержать минимум 6 символов."); return; }
        if (emailRegistrationToken == null || phoneRegistrationToken == null) {
            statusView.setText("Сначала подтвердите email и телефон."); return;
        }
        setBusy(true);
        statusView.setText("Создаём аккаунт…");
        executor.execute(() -> {
            try {
                JSONObject response = api.register(email, password, username, emailRegistrationToken, phone, phoneRegistrationToken);
                String token = response.optString("token", "");
                JSONObject user = response.optJSONObject("user");
                if (token.isEmpty() || user == null) throw new IllegalStateException("Неполный ответ регистрации.");
                api.setAccessToken(token);
                getSharedPreferences("skyline_session", MODE_PRIVATE).edit()
                        .putString("encrypted_token", crypto.protectLocalSecret(token)).apply();
                String publicKey = crypto.ensurePublicKey();
                boolean keyReady = false;
                String warning = null;
                try {
                    JSONObject serverKey = api.getMyPublicKey();
                    keyReady = publicKey.equals(serverKey.optString("publicKey", ""));
                    if (!keyReady) warning = "Ключ шифрования отличается от ключа сервера. E2EE отправка отключена.";
                } catch (SkylineApiClient.SkylineApiException keyError) {
                    if (keyError.getStatusCode() == 404) { api.uploadPublicKey(publicKey); keyReady = true; }
                    else throw keyError;
                }
                JSONArray contacts = api.getContacts();
                final boolean cryptoReady = keyReady;
                final String cryptoWarning = warning;
                runOnUiThread(() -> {
                    currentUser = user;
                    e2eeReady = cryptoReady;
                    connectRealtime();
                    renderContacts(contacts, cryptoWarning);
                });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось создать аккаунт." : error.getMessage();
                runOnUiThread(() -> { setBusy(false); statusView.setText("Ошибка регистрации: " + message); });
            }
        });
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
                getSharedPreferences("skyline_session", MODE_PRIVATE).edit()
                        .putString("encrypted_token", crypto.protectLocalSecret(api.getAccessToken())).apply();
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

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setGravity(Gravity.CENTER);
        String[][] navItems = new String[][] {
                {"Группы", "groups"}, {"Каналы", "channels"}, {"Истории", "stories"},
                {"Сохранённое", "saved"}, {"Настройки", "settings"}
        };
        for (String[] navItem : navItems) {
            Button navButton = new Button(this);
            navButton.setText(navItem[0]);
            navButton.setTextSize(10);
            nav.addView(navButton, new LinearLayout.LayoutParams(0, dp(46), 1));
            navButton.setOnClickListener(v -> openFeature(navItem[1]));
        }
        screen.addView(nav, matchWrap());

        LinearLayout searchRow = new LinearLayout(this);
        searchRow.setOrientation(LinearLayout.HORIZONTAL);
        searchRow.setGravity(Gravity.CENTER_VERTICAL);
        EditText userSearch = new EditText(this);
        userSearch.setSingleLine(true);
        userSearch.setInputType(1);
        userSearch.setHint("Найти пользователя по имени или @username");
        searchRow.addView(userSearch, new LinearLayout.LayoutParams(0, dp(52), 1));
        Button searchButton = new Button(this);
        searchButton.setText("Найти");
        searchRow.addView(searchButton);
        screen.addView(searchRow, matchWrap());

        LinearLayout results = new LinearLayout(this);
        results.setOrientation(LinearLayout.VERTICAL);
        searchResultsContainer = results;
        ScrollView resultsScroll = new ScrollView(this);
        searchResultsScroll = resultsScroll;
        resultsScroll.setVisibility(View.GONE);
        resultsScroll.addView(results);
        screen.addView(resultsScroll, new LinearLayout.LayoutParams(-1, dp(180)));
        searchButton.setOnClickListener(v -> {
            String query = userSearch.getText().toString().trim();
            if (query.replace("@", "").trim().length() < 2) {
                Toast.makeText(this, "Введите не менее двух символов для поиска.", Toast.LENGTH_SHORT).show();
                return;
            }
            searchButton.setEnabled(false);
            resultsScroll.setVisibility(View.VISIBLE);
            results.removeAllViews();
            results.addView(text("Поиск пользователей…", 13, 0xFF586778), matchWrap());
            executor.execute(() -> {
                try {
                    JSONArray found = api.searchUsers(query);
                    runOnUiThread(() -> {
                        searchButton.setEnabled(true);
                        if (searchResultsContainer != results) return;
                        results.removeAllViews();
                        if (found.length() == 0) {
                            results.addView(text("Пользователи не найдены.", 13, 0xFF586778), matchWrap());
                            return;
                        }
                        for (int i = 0; i < found.length(); i++) {
                            JSONObject person = found.optJSONObject(i);
                            if (person == null) continue;
                            String personId = person.optString("id", "");
                            if (personId.isEmpty()) continue;
                            String username = person.optString("username", "");
                            String displayName = person.optString("displayName", username.isEmpty() ? "Пользователь" : username);
                            LinearLayout resultRow = new LinearLayout(this);
                            resultRow.setOrientation(LinearLayout.HORIZONTAL);
                            resultRow.setGravity(Gravity.CENTER_VERTICAL);
                            TextView personLabel = text(displayName + (username.isEmpty() ? "" : "\n@" + username), 14, 0xFF263445);
                            personLabel.setPadding(dp(8), dp(6), dp(8), dp(6));
                            resultRow.addView(personLabel, new LinearLayout.LayoutParams(0, -2, 1));
                            Button add = new Button(this);
                            add.setText("Добавить");
                            add.setOnClickListener(addView -> {
                                add.setEnabled(false);
                                executor.execute(() -> {
                                    try {
                                        api.addContact(personId, displayName);
                                        runOnUiThread(() -> {
                                            Toast.makeText(this, "Контакт добавлен.", Toast.LENGTH_SHORT).show();
                                            refreshContacts();
                                        });
                                    } catch (Exception addError) {
                                        String message = addError.getMessage() == null ? "Не удалось добавить контакт." : addError.getMessage();
                                        runOnUiThread(() -> {
                                            add.setEnabled(true);
                                            Toast.makeText(this, message, Toast.LENGTH_LONG).show();
                                        });
                                    }
                                });
                            });
                            resultRow.addView(add);
                            results.addView(resultRow, matchWrap());
                        }
                    });
                } catch (Exception searchError) {
                    String message = searchError.getMessage() == null ? "Не удалось выполнить поиск." : searchError.getMessage();
                    runOnUiThread(() -> {
                        searchButton.setEnabled(true);
                        if (searchResultsContainer == results) {
                            results.removeAllViews();
                            results.addView(text("Ошибка поиска: " + message, 13, 0xFFB42318), matchWrap());
                        }
                    });
                }
            });
        });

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
            getSharedPreferences("skyline_session", MODE_PRIVATE).edit().remove("encrypted_token").apply();
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
        stopTyping();
        // Leaving the conversation screen must also clear the active chat reference;
        // otherwise realtime events can unexpectedly reopen a chat over the list.
        activeContactId = null;
        activeConversationTitle = null;
        activeGroupId = null;
        activeGroup = null;
        activeMessageInput = null;
        searchResultsContainer = null;
        searchResultsScroll = null;
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
        if (activeContactId != null && !activeContactId.equals(contactId)) {
            if (isTypingToContact && realtime != null) realtime.setTyping(activeContactId, false);
            if (typingStopRunnable != null) typingHandler.removeCallbacks(typingStopRunnable);
            typingStopRunnable = null;
            isTypingToContact = false;
        }
        activeGroupId = null;
        activeGroup = null;
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

        typingStatusView = text("", 12, 0xFF586778);
        typingStatusView.setVisibility(View.GONE);
        LinearLayout.LayoutParams typingParams = matchWrap();
        typingParams.bottomMargin = dp(4);
        screen.addView(typingStatusView, typingParams);

        LinearLayout messagesContainer = new LinearLayout(this);
        messagesContainer.setOrientation(LinearLayout.VERTICAL);
        messagesContainer.addView(text("Загрузка сообщений…", 14, 0xFF263445), matchWrap());
        ScrollView scroll = new ScrollView(this);
        scroll.addView(messagesContainer);
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
        messageInput.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { }
            @Override public void afterTextChanged(Editable editable) {
                if (realtime == null) return;
                boolean hasText = editable != null && editable.toString().trim().length() > 0;
                if (hasText && !isTypingToContact) {
                    realtime.setTyping(contactId, true);
                    isTypingToContact = true;
                }
                if (typingStopRunnable != null) typingHandler.removeCallbacks(typingStopRunnable);
                if (hasText) {
                    typingStopRunnable = () -> {
                        if (contactId.equals(activeContactId) && isTypingToContact && realtime != null) {
                            realtime.setTyping(contactId, false);
                            isTypingToContact = false;
                        }
                    };
                    typingHandler.postDelayed(typingStopRunnable, 1800);
                } else if (isTypingToContact) {
                    realtime.setTyping(contactId, false);
                    isTypingToContact = false;
                }
            }
        });
        Button attach = new Button(this);
        attach.setText("＋");
        attach.setContentDescription("Прикрепить изображение");
        attach.setOnClickListener(v -> pickChatImage());
        composer.addView(attach);
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
                ArrayList<JSONObject> messageItems = new ArrayList<>();
                ArrayList<String> displayRows = new ArrayList<>();
                ArrayList<String> attachmentPayloads = new ArrayList<>();
                for (int i = 0; i < messages.length(); i++) {
                    JSONObject message = messages.optJSONObject(i);
                    if (message == null) continue;
                    String currentUserId = currentUser == null ? "" : currentUser.optString("userId", currentUser.optString("id", ""));
                    boolean own = !currentUserId.isEmpty() && currentUserId.equals(message.optString("senderId", ""));
                    String sender = own ? "Вы" : title;
                    String type = message.optString("type", "text");
                    String body = message.optString("text", "");
                    String attachmentPayload = null;
                    if (message.optBoolean("deletedForAll", false)) {
                        body = "Это сообщение удалено";
                    } else if (!"text".equals(type)) {
                        String encryptedFile = message.optString("fileData", "");
                        if (encryptedFile.startsWith("skyline-e2e:v4:")) {
                            try {
                                String decrypted = crypto.decryptMessage(encryptedFile, currentUserId);
                                if (decrypted.startsWith("skyline-attachment:v1\n")) {
                                    attachmentPayload = decrypted;
                                    String[] parts = decrypted.split("\n", 4);
                                    body = parts.length >= 3 ? "📷 " + parts[2] : "📷 Изображение";
                                } else {
                                    body = "📎 Вложение (неподдерживаемый формат)";
                                }
                            } catch (Exception decryptError) {
                                body = "🔒 Не удалось расшифровать вложение на этом устройстве";
                            }
                        } else {
                            body = "📎 Вложение";
                        }
                    } else if (body.startsWith("skyline-e2e:v4:")) {
                        try { body = crypto.decryptMessage(body, currentUserId); }
                        catch (Exception decryptError) { body = "🔒 Не удалось расшифровать сообщение на этом устройстве"; }
                    } else if (body.startsWith("skyline-e2e:") || body.startsWith("oursocial-e2e:")) {
                        body = "🔒 Сообщение использует старый формат шифрования, пока не поддерживаемый Android";
                    }
                    String createdAt = message.optString("createdAt", "");
                    if (createdAt.length() > 16) createdAt = createdAt.substring(0, 16).replace('T', ' ');
                    displayRows.add((message.optBoolean("pinned", false) ? "📌 " : "") + sender + (createdAt.isEmpty() ? "" : " · " + createdAt) + "\n" + body);
                    attachmentPayloads.add(attachmentPayload);
                    messageItems.add(message);
                }
                runOnUiThread(() -> {
                    if (!contactId.equals(activeContactId)) return;
                    messagesContainer.removeAllViews();
                    if (displayRows.isEmpty()) {
                        messagesContainer.addView(text("Сообщений пока нет.", 14, 0xFF586778), matchWrap());
                    } else {
                        for (int i = 0; i < displayRows.size(); i++) {
                            final JSONObject message = messageItems.get(i);
                            LinearLayout bubble = new LinearLayout(this);
                            bubble.setOrientation(LinearLayout.VERTICAL);
                            bubble.setPadding(dp(12), dp(10), dp(12), dp(10));
                            bubble.setBackgroundColor(i % 2 == 0 ? 0xFFFFFFFF : 0xFFEAF2FA);
                            TextView row = text(displayRows.get(i), 14, 0xFF263445);
                            bubble.addView(row, matchWrap());
                            String attachment = attachmentPayloads.get(i);
                            if (attachment != null) {
                                try {
                                    String[] parts = attachment.split("\n", 4);
                                    if (parts.length == 4) {
                                        byte[] imageBytes = Base64.decode(parts[3], Base64.DEFAULT);
                                        Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
                                        if (bitmap != null) {
                                            ImageView imageView = new ImageView(this);
                                            imageView.setImageBitmap(bitmap);
                                            imageView.setAdjustViewBounds(true);
                                            imageView.setScaleType(ImageView.ScaleType.FIT_CENTER);
                                            imageView.setMaxHeight(dp(320));
                                            LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(-1, -2);
                                            imageParams.topMargin = dp(8);
                                            bubble.addView(imageView, imageParams);
                                        } else {
                                            bubble.addView(text("Не удалось декодировать изображение.", 13, 0xFFB42318), matchWrap());
                                        }
                                    }
                                } catch (Exception imageError) {
                                    bubble.addView(text("Не удалось показать изображение.", 13, 0xFFB42318), matchWrap());
                                }
                            }
                            LinearLayout.LayoutParams rowParams = matchWrap();
                            rowParams.bottomMargin = dp(5);
                            messagesContainer.addView(bubble, rowParams);
                            bubble.setOnLongClickListener(v -> {
                                showMessageActions(message, contactId, title);
                                return true;
                            });
                        }
                    }
                    setBusy(false);
                });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось загрузить историю." : error.getMessage();
                runOnUiThread(() -> {
                    messagesContainer.removeAllViews();
                    messagesContainer.addView(text("Ошибка загрузки сообщений: " + message, 14, 0xFFB42318), matchWrap());
                    setBusy(false);
                });
            }
        });
    }

    private void showMessageActions(JSONObject message, String recipientId, String title) {
        boolean own = currentUser != null && currentUser.optString("id", currentUser.optString("userId", ""))
                .equals(message.optString("senderId", ""));
        ArrayList<String> labels = new ArrayList<>();
        labels.add("Реакция 👍");
        labels.add(message.optBoolean("pinned", false) ? "Открепить" : "Закрепить");
        labels.add("Сохранить в избранное");
        labels.add("Ответить");
        if (own) labels.add("Удалить у всех");
        new AlertDialog.Builder(this).setTitle("Действия с сообщением")
                .setItems(labels.toArray(new String[0]), (dialog, which) -> {
                    String action = labels.get(which);
                    if ("Ответить".equals(action)) {
                        showReplyDialog(message, recipientId, title);
                        return;
                    }
                    String messageId = message.optString("id", message.optString("messageId", ""));
                    if (messageId.isEmpty()) {
                        Toast.makeText(this, "У сообщения отсутствует идентификатор.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    executor.execute(() -> {
                        try {
                            if ("Реакция 👍".equals(action)) api.reactToMessage(messageId, "👍");
                            else if ("Закрепить".equals(action) || "Открепить".equals(action)) api.pinMessage(messageId, !message.optBoolean("pinned", false));
                            else if ("Сохранить в избранное".equals(action)) api.saveMessage(messageId);
                            else if ("Удалить у всех".equals(action)) api.deleteMessageForAll(messageId);
                            runOnUiThread(() -> {
                                Toast.makeText(this, "Готово.", Toast.LENGTH_SHORT).show();
                                openConversation(recipientId, title);
                            });
                        } catch (Exception error) {
                            String messageText = error.getMessage() == null ? "Действие не выполнено." : error.getMessage();
                            runOnUiThread(() -> Toast.makeText(this, messageText, Toast.LENGTH_LONG).show());
                        }
                    });
                }).show();
    }

    private void showReplyDialog(JSONObject original, String recipientId, String title) {
        EditText input = new EditText(this);
        input.setHint("Ваш ответ…");
        new AlertDialog.Builder(this).setTitle("Ответить на сообщение").setView(input)
                .setNegativeButton("Отмена", null)
                .setPositiveButton("Отправить", (dialog, which) -> {
                    String plaintext = input.getText().toString().trim();
                    String messageId = original.optString("id", original.optString("messageId", ""));
                    if (plaintext.isEmpty() || messageId.isEmpty()) return;
                    if (!e2eeReady) {
                        Toast.makeText(this, "Отправка отключена из-за несовпадения ключей.", Toast.LENGTH_LONG).show();
                        return;
                    }
                    executor.execute(() -> {
                        try {
                            String ownId = currentUser.optString("id", currentUser.optString("userId", ""));
                            String ownKey = crypto.ensurePublicKey();
                            String targetKey = api.getPublicKey(recipientId).optString("publicKey", "");
                            if (targetKey.isEmpty()) throw new IllegalStateException("У собеседника нет ключа шифрования.");
                            String encrypted = crypto.encryptMessage(plaintext, ownId, ownKey, recipientId, targetKey);
                            api.replyToMessage(messageId, encrypted);
                            runOnUiThread(() -> openConversation(recipientId, title));
                        } catch (Exception error) {
                            String message = error.getMessage() == null ? "Не удалось ответить." : error.getMessage();
                            runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
                        }
                    });
                }).show();
    }

    private void pickChatImage() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        startActivityForResult(intent, PICK_CHAT_IMAGE);
    }

    private void sendChatImageResult(Intent data) {\n        final Uri uri = data.getData();
        final String recipientId = activeContactId;
        final String title = activeConversationTitle;
        if (recipientId == null || currentUser == null) { Toast.makeText(this, "Сначала откройте личный чат.", Toast.LENGTH_SHORT).show(); return; }
        executor.execute(() -> {
            try {
                String mime = getContentResolver().getType(uri);
                if (mime == null || !mime.startsWith("image/")) throw new IllegalArgumentException("Выберите файл изображения.");
                byte[] bytes;
                try (InputStream stream = getContentResolver().openInputStream(uri); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    if (stream == null) throw new IllegalStateException("Не удалось открыть изображение.");
                    byte[] buffer = new byte[8192]; int count;
                    while ((count = stream.read(buffer)) != -1) { if (output.size() + count > 1200000) throw new IllegalArgumentException("Изображение слишком большое. Максимум 1,2 МБ."); output.write(buffer, 0, count); }
                    bytes = output.toByteArray();
                }
                if (bytes.length == 0) throw new IllegalArgumentException("Файл пустой.");
                String senderId = currentUser.optString("id", currentUser.optString("userId", ""));
                String ownPublicKey = crypto.ensurePublicKey();
                String recipientPublicKey = api.getPublicKey(recipientId).optString("publicKey", "");
                if (senderId.isEmpty() || recipientPublicKey.isEmpty()) throw new IllegalStateException("У одного из участников нет ключа шифрования.");
                String filename = "image";
                try (android.database.Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
                    if (cursor != null) { int column = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME); if (column >= 0 && cursor.moveToFirst()) { String value = cursor.getString(column); if (value != null && !value.trim().isEmpty()) filename = value.replace("\\n", "").replace("\\r", ""); } }
                } catch (Exception ignored) { }
                String payload = "skyline-attachment:v1\\n" + mime + "\\n" + filename + "\\n" + Base64.encodeToString(bytes, Base64.NO_WRAP);
                String encrypted = crypto.encryptMessage(payload, senderId, ownPublicKey, recipientId, recipientPublicKey);
                api.sendAttachment(recipientId, "image", encrypted);
                runOnUiThread(() -> { Toast.makeText(this, "Зашифрованное изображение отправлено.", Toast.LENGTH_SHORT).show(); if (recipientId.equals(activeContactId)) openConversation(recipientId, title == null ? "Чат" : title); });
            } catch (Exception error) { String message = error.getMessage() == null ? "Не удалось отправить изображение." : error.getMessage(); runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show()); }
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

    private void openFeature(String feature) {
        stopTyping();
        activeGroupId = null;
        activeGroup = null;
        activeContactId = null;
        activeConversationTitle = null;
        activeMessageInput = null;
        searchResultsContainer = null;
        searchResultsScroll = null;
        setBusy(true);
        executor.execute(() -> {
            try {
                JSONArray items;
                switch (feature) {
                    case "groups": items = api.getGroups(); break;
                    case "channels": items = api.getChannels(); break;
                    case "stories": items = api.getStories(); break;
                    case "saved": items = api.getSavedMessages(); break;
                    default: items = new JSONArray(); break;
                }
                JSONObject settings = "settings".equals(feature) ? api.getSettings() : null;
                runOnUiThread(() -> renderFeature(feature, items, settings, null));
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось загрузить раздел." : error.getMessage();
                runOnUiThread(() -> renderFeature(feature, new JSONArray(), null, message));
            }
        });
    }

    private void renderFeature(String feature, JSONArray items, JSONObject settings, String errorText) {
        LinearLayout screen = createScreen();
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = new Button(this);
        back.setText("‹ Чаты");
        back.setOnClickListener(v -> refreshContacts());
        header.addView(back);
        TextView title = text(featureTitle(feature), 22, 0xFF1877D2);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        screen.addView(header, matchWrap());

        if ("groups".equals(feature) || "channels".equals(feature)) {
            Button create = new Button(this);
            create.setText("＋ Создать");
            create.setOnClickListener(v -> showCreateDialog(feature));
            screen.addView(create, matchWrap());
        } else if ("stories".equals(feature)) {
            Button createStory = new Button(this);
            createStory.setText("＋ Добавить историю");
            createStory.setOnClickListener(v -> startStoryCreation());
            screen.addView(createStory, matchWrap());
        }

        if (errorText != null) {
            screen.addView(text("Ошибка: " + errorText, 14, 0xFFB42318), matchWrap());
        } else if ("settings".equals(feature)) {
            addSettingToggle(screen, "Тёмная тема", "theme", settings);
            addSettingToggle(screen, "Анимации", "animationsEnabled", settings);
            TextView note = text("Настройки сохраняются в аккаунте Skyline. Расширенные настройки приватности и устройств будут добавлены отдельными этапами.", 12, 0xFF586778);
            note.setPadding(0, dp(12), 0, 0);
            screen.addView(note, matchWrap());
        } else {
            ScrollView scroll = new ScrollView(this);
            LinearLayout list = new LinearLayout(this);
            list.setOrientation(LinearLayout.VERTICAL);
            if (items.length() == 0) {
                String empty = "stories".equals(feature) ? "Активных историй пока нет."
                        : "saved".equals(feature) ? "Сохранённых сообщений пока нет."
                        : "Пока пусто. Используйте кнопку создания, чтобы добавить первый элемент.";
                list.addView(text(empty, 14, 0xFF586778), matchWrap());
            }
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item == null) continue;
                final JSONObject selected = item;
                String id = item.optString("id", item.optString("savedId", ""));
                String name = "groups".equals(feature) || "channels".equals(feature)
                        ? item.optString("title", "Без названия")
                        : "stories".equals(feature)
                            ? item.optString("displayName", item.optString("username", "История"))
                            : item.optJSONObject("message") == null ? "Сохранённое сообщение"
                                : item.optJSONObject("message").optString("text", "Сохранённое сообщение");
                if (name.startsWith("skyline-e2e:") || name.startsWith("oursocial-e2e:")) name = "🔒 Зашифрованное сообщение";
                String detail = "groups".equals(feature)
                        ? item.optString("memberCount", item.optJSONArray("members") == null ? "" : String.valueOf(item.optJSONArray("members").length())) + " участников"
                        : "channels".equals(feature)
                            ? item.optString("visibility", "Канал") + (item.optString("description", "").isEmpty() ? "" : " · " + item.optString("description"))
                            : "stories".equals(feature)
                                ? item.optString("caption", "История") + (item.optBoolean("viewed") ? " · Просмотрено" : "")
                                : "saved".equals(feature) ? "Сохранённое сообщение" : "";
                TextView row = text(name + (detail.isEmpty() ? "" : "\n" + detail), 15, 0xFF263445);
                row.setPadding(dp(12), dp(14), dp(12), dp(14));
                row.setBackgroundColor(i % 2 == 0 ? 0xFFFFFFFF : 0xFFF0F4F8);
                row.setOnClickListener(v -> {
                    if ("groups".equals(feature)) openGroup(selected);
                    else if ("channels".equals(feature)) openChannel(selected);
                    else if ("stories".equals(feature)) openStory(selected);
                    else if ("saved".equals(feature)) {
                        JSONObject msg = selected.optJSONObject("message");
                        String value = msg == null ? "" : msg.optString("text", "");
                        Toast.makeText(this, value.startsWith("skyline-e2e:") ? "Сохранённое сообщение зашифровано и пока не поддерживается этим экраном." : value, Toast.LENGTH_LONG).show();
                    }
                });
                list.addView(row, matchWrap());
            }
            scroll.addView(list);
            screen.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        }
        setContentView(screen);
        setBusy(false);
    }

    private void startStoryCreation() {
        EditText caption = new EditText(this);
        caption.setHint("Подпись (необязательно)");
        new AlertDialog.Builder(this)
                .setTitle("Новая история")
                .setMessage("Выберите изображение. История будет доступна 24 часа.")
                .setView(caption)
                .setNegativeButton("Отмена", null)
                .setPositiveButton("Выбрать изображение", (dialog, which) -> {
                    pendingStoryCaption = caption.getText().toString().trim();
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.setType("image/*");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(Intent.createChooser(intent, "Выберите изображение"), PICK_STORY_IMAGE);
                }).show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_CHAT_IMAGE) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) sendChatImageResult(data);
            return;
        }
        if (requestCode != PICK_STORY_IMAGE || resultCode != RESULT_OK || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        setBusy(true);
        executor.execute(() -> {
            try {
                String dataUrl = encodeStoryImage(uri);
                api.createStory("image", dataUrl, pendingStoryCaption);
                runOnUiThread(() -> {
                    setBusy(false);
                    Toast.makeText(this, "История опубликована на 24 часа.", Toast.LENGTH_SHORT).show();
                    openFeature("stories");
                });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Не удалось загрузить изображение." : error.getMessage();
                runOnUiThread(() -> {
                    setBusy(false);
                    new AlertDialog.Builder(this).setTitle("Ошибка публикации").setMessage(message).setPositiveButton("OK", null).show();
                });
            }
        });
    }

    private String encodeStoryImage(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IllegalStateException("Не удалось открыть изображение.");
            BitmapFactory.decodeStream(input, null, bounds);
        }
        int sample = 1;
        while (Math.max(bounds.outWidth / sample, bounds.outHeight / sample) > 1600) sample *= 2;
        Bitmap bitmap;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IllegalStateException("Не удалось прочитать изображение.");
            bitmap = BitmapFactory.decodeStream(input, null, options);
        }
        if (bitmap == null) throw new IllegalArgumentException("Этот формат изображения не поддерживается.");
        int max = Math.max(bitmap.getWidth(), bitmap.getHeight());
        if (max > 1280) {
            float scale = 1280f / max;
            Bitmap resized = Bitmap.createScaledBitmap(bitmap, Math.max(1, Math.round(bitmap.getWidth() * scale)),
                    Math.max(1, Math.round(bitmap.getHeight() * scale)), true);
            if (resized != bitmap) bitmap.recycle();
            bitmap = resized;
        }
        byte[] compressed = null;
        for (int quality = 82; quality >= 42; quality -= 10) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output);
            compressed = output.toByteArray();
            if (compressed.length <= 900_000) break;
        }
        bitmap.recycle();
        if (compressed == null || compressed.length > 1_000_000)
            throw new IllegalArgumentException("Изображение слишком большое даже после сжатия. Выберите другое.");
        return "data:image/jpeg;base64," + Base64.encodeToString(compressed, Base64.NO_WRAP);
    }

    private void openStory(JSONObject story) {
        String storyId = story.optString("id", "");
        String mediaType = story.optString("mediaType", "image");
        executor.execute(() -> {
            try { if (!storyId.isEmpty()) api.viewStory(storyId); } catch (Exception ignored) {}
        });
        LinearLayout screen = createScreen();
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        Button back = new Button(this);
        back.setText("‹ Истории");
        back.setOnClickListener(v -> openFeature("stories"));
        header.addView(back);
        header.addView(text(story.optString("displayName", story.optString("username", "История")), 20, 0xFF1877D2),
                new LinearLayout.LayoutParams(0, -2, 1));
        screen.addView(header, matchWrap());
        if ("image".equals(mediaType)) {
            try {
                String mediaData = story.optString("mediaData", "");
                int comma = mediaData.indexOf(',');
                if (comma >= 0) mediaData = mediaData.substring(comma + 1);
                byte[] bytes = Base64.decode(mediaData, Base64.DEFAULT);
                ImageView imageView = new ImageView(this);
                imageView.setAdjustViewBounds(true);
                imageView.setScaleType(ImageView.ScaleType.FIT_CENTER);
                imageView.setImageBitmap(BitmapFactory.decodeByteArray(bytes, 0, bytes.length));
                screen.addView(imageView, new LinearLayout.LayoutParams(-1, 0, 1));
            } catch (Exception error) {
                screen.addView(text("Не удалось показать изображение истории.", 14, 0xFFB42318), matchWrap());
            }
        } else {
            screen.addView(text("Видеозаписи историй пока не поддерживаются в Android-клиенте.", 14, 0xFF586778), matchWrap());
        }
        screen.addView(text(story.optString("caption", ""), 15, 0xFF263445), matchWrap());
        setContentView(screen);
    }

    private String featureTitle(String feature) {
        switch (feature) {
            case "groups": return "Группы";
            case "channels": return "Каналы";
            case "stories": return "Истории";
            case "saved": return "Сохранённое";
            case "settings": return "Настройки";
            default: return "Skyline";
        }
    }

    private void showCreateDialog(String feature) {
        LinearLayout fields = new LinearLayout(this);
        fields.setOrientation(LinearLayout.VERTICAL);
        fields.setPadding(dp(20), dp(4), dp(20), 0);
        EditText title = new EditText(this);
        title.setSingleLine(true);
        title.setHint("Название");
        fields.addView(title, matchWrap());
        EditText description = new EditText(this);
        description.setHint("Описание");
        fields.addView(description, matchWrap());
        EditText visibility = new EditText(this);
        if ("channels".equals(feature)) {
            visibility.setSingleLine(true);
            visibility.setHint("Публичный или private");
            visibility.setText("public");
            fields.addView(visibility, matchWrap());
        }
        new AlertDialog.Builder(this)
                .setTitle("groups".equals(feature) ? "Создать группу" : "Создать канал")
                .setView(fields)
                .setNegativeButton("Отмена", null)
                .setPositiveButton("Создать", (dialog, which) -> {
                    String name = title.getText().toString().trim();
                    if (name.length() < 2) {
                        Toast.makeText(this, "Название должно содержать минимум 2 символа.", Toast.LENGTH_SHORT).show();
                        return;
                    }
                    executor.execute(() -> {
                        try {
                            if ("groups".equals(feature)) api.createGroup(name, description.getText().toString(), new JSONArray());
                            else {
                                String vis = visibility.getText().toString().trim().equalsIgnoreCase("private") ? "private" : "public";
                                api.createChannel(name, description.getText().toString(), vis);
                            }
                            runOnUiThread(() -> {
                                Toast.makeText(this, "Создано.", Toast.LENGTH_SHORT).show();
                                openFeature(feature);
                            });
                        } catch (Exception error) {
                            String message = error.getMessage() == null ? "Не удалось создать." : error.getMessage();
                            runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
                        }
                    });
                }).show();
    }

    private void openGroup(JSONObject group) {
        String groupId = group.optString("id", "");
        String title = group.optString("title", "Группа");
        activeGroupId = groupId;
        activeGroup = group;
        activeContactId = null;
        activeConversationTitle = null;
        LinearLayout screen = createScreen();
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        Button back = new Button(this);
        back.setText("‹ Группы");
        back.setOnClickListener(v -> openFeature("groups"));
        header.addView(back);
        header.addView(text(title, 20, 0xFF1877D2), new LinearLayout.LayoutParams(0, -2, 1));
        screen.addView(header, matchWrap());
        TextView content = text("Загрузка сообщений группы…", 14, 0xFF263445);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        screen.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout composer = new LinearLayout(this);
        composer.setOrientation(LinearLayout.HORIZONTAL);
        EditText input = new EditText(this);
        input.setHint("Сообщение в группу…");
        input.setMinLines(1);
        input.setMaxLines(4);
        composer.addView(input, new LinearLayout.LayoutParams(0, -2, 1));
        Button send = new Button(this);
        send.setText("Отправить");
        send.setOnClickListener(v -> {
            String plaintext = input.getText().toString().trim();
            if (plaintext.isEmpty()) return;
            if (!e2eeReady) {
                input.setError("Отправка отключена: ключ аккаунта не совпадает с ключом устройства.");
                return;
            }
            JSONArray members = group.optJSONArray("members");
            JSONObject recipientKeys = new JSONObject();
            String ownId = currentUser == null ? "" : currentUser.optString("id", currentUser.optString("userId", ""));
            try {
                if (members == null || members.length() == 0) throw new IllegalStateException("Не удалось получить список участников группы.");
                String ownPublicKey = crypto.ensurePublicKey();
                for (int i = 0; i < members.length(); i++) {
                    JSONObject member = members.optJSONObject(i);
                    if (member == null) continue;
                    String memberId = member.optString("userId", "");
                    String memberKey = member.optString("publicKey", "");
                    if (memberId.equals(ownId) && memberKey.isEmpty()) memberKey = ownPublicKey;
                    if (memberId.isEmpty() || memberKey.isEmpty()) {
                        throw new IllegalStateException("У всех участников должен быть зарегистрирован E2EE-ключ. Попросите участника открыть Skyline и повторите попытку.");
                    }
                    recipientKeys.put(memberId, memberKey);
                }
            } catch (Exception keyError) {
                input.setError(keyError.getMessage() == null ? "Не удалось подготовить ключи группы." : keyError.getMessage());
                return;
            }
            send.setEnabled(false);
            executor.execute(() -> {
                try {
                    String encrypted = crypto.encryptMessageForRecipients(plaintext, recipientKeys);
                    api.sendGroupMessage(groupId, encrypted);
                    runOnUiThread(() -> {
                        input.setText("");
                        send.setEnabled(true);
                        openGroup(group);
                    });
                } catch (Exception error) {
                    String message = error.getMessage() == null ? "Не удалось отправить сообщение в группу." : error.getMessage();
                    runOnUiThread(() -> {
                        send.setEnabled(true);
                        input.setError(message);
                    });
                }
            });
        });
        composer.addView(send);
        screen.addView(composer, matchWrap());
        setContentView(screen);
        executor.execute(() -> {
            try {
                JSONArray messages = api.getGroupMessages(groupId);
                StringBuilder output = new StringBuilder();
                String ownId = currentUser == null ? "" : currentUser.optString("id", currentUser.optString("userId", ""));
                for (int i = 0; i < messages.length(); i++) {
                    JSONObject m = messages.optJSONObject(i);
                    if (m == null) continue;
                    if (output.length() > 0) output.append("\n\n");
                    String senderId = m.optString("senderId", "");
                    String body = m.optString("text", "");
                    if (body.startsWith("skyline-e2e:v4:")) {
                        try { body = crypto.decryptMessage(body, ownId); }
                        catch (Exception decryptError) { body = "🔒 Не удалось расшифровать сообщение для этого аккаунта"; }
                    } else if (body.startsWith("skyline-e2e:") || body.startsWith("oursocial-e2e:")) {
                        body = "🔒 Сообщение использует старый формат шифрования";
                    }
                    output.append(senderId.equals(ownId) ? "Вы" : senderId).append(": ").append(body);
                }
                if (output.length() == 0) output.append("Сообщений пока нет. Отправьте первое сообщение.");
                String rendered = output.toString();
                runOnUiThread(() -> {
                    if (groupId.equals(activeGroupId)) content.setText(rendered);
                });
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Ошибка загрузки сообщений." : error.getMessage();
                runOnUiThread(() -> content.setText(message));
            }
        });
    }

    private void openChannel(JSONObject channel) {
        activeGroupId = null;
        activeGroup = null;
        activeContactId = null;
        String channelId = channel.optString("id", "");
        String title = channel.optString("title", "Канал");
        LinearLayout screen = createScreen();
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        Button back = new Button(this);
        back.setText("‹ Каналы");
        back.setOnClickListener(v -> openFeature("channels"));
        header.addView(back);
        header.addView(text(title, 20, 0xFF1877D2), new LinearLayout.LayoutParams(0, -2, 1));
        screen.addView(header, matchWrap());
        TextView content = text("Загрузка публикаций…", 14, 0xFF263445);
        ScrollView scroll = new ScrollView(this);
        scroll.addView(content);
        screen.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout composer = new LinearLayout(this);
        EditText postInput = new EditText(this);
        postInput.setHint("Новая публикация");
        composer.addView(postInput, new LinearLayout.LayoutParams(0, -2, 1));
        Button publish = new Button(this);
        publish.setText("Опубликовать");
        publish.setOnClickListener(v -> {
            String value = postInput.getText().toString().trim();
            if (value.isEmpty()) return;
            publish.setEnabled(false);
            executor.execute(() -> {
                try {
                    api.createChannelPost(channelId, value);
                    runOnUiThread(() -> openChannel(channel));
                } catch (Exception error) {
                    String message = error.getMessage() == null ? "Не удалось опубликовать." : error.getMessage();
                    runOnUiThread(() -> {
                        publish.setEnabled(true);
                        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
                    });
                }
            });
        });
        composer.addView(publish);
        screen.addView(composer, matchWrap());
        setContentView(screen);
        executor.execute(() -> {
            try {
                JSONArray posts = api.getChannelPosts(channelId);
                StringBuilder output = new StringBuilder();
                for (int i = 0; i < posts.length(); i++) {
                    JSONObject post = posts.optJSONObject(i);
                    if (post == null) continue;
                    if (output.length() > 0) output.append("\n\n");
                    output.append(post.optString("text", "📎 Вложение"));
                }
                if (output.length() == 0) output.append("Публикаций пока нет.");
                String rendered = output.toString();
                runOnUiThread(() -> content.setText(rendered));
            } catch (Exception error) {
                String message = error.getMessage() == null ? "Ошибка загрузки канала." : error.getMessage();
                runOnUiThread(() -> content.setText(message));
            }
        });
    }

    private void addSettingToggle(LinearLayout screen, String label, String key, JSONObject settings) {
        boolean initial = "theme".equals(key)
                ? "dark".equals(settings == null ? "dark" : settings.optString("theme", "dark"))
                : settings != null && settings.optBoolean(key, true);
        CheckBox check = new CheckBox(this);
        check.setText(label);
        check.setChecked(initial);
        check.setTextColor(0xFF263445);
        check.setOnCheckedChangeListener((button, checked) -> executor.execute(() -> {
            try {
                JSONObject update = new JSONObject();
                update.put(key, "theme".equals(key) ? (checked ? "dark" : "light") : checked);
                api.saveSettings(update);
                runOnUiThread(() -> Toast.makeText(this, "Настройки сохранены.", Toast.LENGTH_SHORT).show());
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(this, "Не удалось сохранить настройку.", Toast.LENGTH_SHORT).show());
            }
        }));
        screen.addView(check, matchWrap());
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
                    String eventGroupId = event.optString("groupId", "");
                    if (activeGroupId != null) {
                        if (activeGroup != null && activeGroupId.equals(eventGroupId)) openGroup(activeGroup);
                        return;
                    }
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
            typingListener = args -> {
                if (args == null || args.length == 0 || !(args[0] instanceof JSONObject)) return;
                JSONObject event = (JSONObject) args[0];
                runOnUiThread(() -> {
                    if (typingStatusView == null || activeContactId == null) return;
                    String typingUserId = event.optString("userId", "");
                    if (!activeContactId.equals(typingUserId)) return;
                    boolean typing = event.optBoolean("isTyping", false);
                    typingStatusView.setText(typing ? event.optString("username", "Собеседник") + " печатает…" : "");
                    typingStatusView.setVisibility(typing ? View.VISIBLE : View.GONE);
                });
            };
            realtime.on("user_typing", typingListener);
            realtime.connect();
        } catch (Exception error) {
            // REST chat/history remain available if the realtime endpoint is unavailable.
            realtime = null;
            messageChangedListener = null;
        }
    }

    private void stopTyping() {
        if (isTypingToContact && realtime != null && activeContactId != null) {
            realtime.setTyping(activeContactId, false);
        }
        if (typingStopRunnable != null) typingHandler.removeCallbacks(typingStopRunnable);
        typingStopRunnable = null;
        isTypingToContact = false;
    }

    private void disconnectRealtime() {
        stopTyping();
        if (realtime != null) {
            if (messageChangedListener != null) realtime.off("message_changed", messageChangedListener);
            if (typingListener != null) realtime.off("user_typing", typingListener);
            realtime.disconnect();
            realtime = null;
        }
        messageChangedListener = null;
        typingListener = null;
        if (typingStopRunnable != null) typingHandler.removeCallbacks(typingStopRunnable);
        typingStopRunnable = null;
        isTypingToContact = false;
        typingStatusView = null;
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
