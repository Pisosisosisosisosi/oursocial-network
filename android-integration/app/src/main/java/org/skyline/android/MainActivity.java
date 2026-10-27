package org.skyline.android;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import org.json.JSONObject;
import org.skyline.android.api.SkylineApiClient;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final SkylineApiClient api = new SkylineApiClient();
    private EditText emailInput;
    private EditText passwordInput;
    private TextView statusView;
    private Button loginButton;
    private ProgressBar progress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        renderLogin();
    }

    private void renderLogin() {
        LinearLayout root = new LinearLayout(this);
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
                String name = user == null ? email : user.optString("displayName", user.optString("username", email));
                runOnUiThread(() -> {
                    setBusy(false);
                    statusView.setText("Вход выполнен. Добро пожаловать, " + name + "!");
                    emailInput.setVisibility(View.GONE);
                    passwordInput.setVisibility(View.GONE);
                    loginButton.setText("Выйти");
                    loginButton.setOnClickListener(v -> {
                        api.clearSession();
                        emailInput.setVisibility(View.VISIBLE);
                        passwordInput.setVisibility(View.VISIBLE);
                        passwordInput.setText("");
                        loginButton.setText("Войти");
                        loginButton.setOnClickListener(ignored -> login());
                        statusView.setText("Вы вышли из аккаунта.");
                    });
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

    private void setBusy(boolean busy) {
        loginButton.setEnabled(!busy);
        progress.setVisibility(busy ? View.VISIBLE : View.GONE);
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    @Override
    protected void onDestroy() {
        executor.shutdownNow();
        super.onDestroy();
    }
}
