# OurSocial

Веб-мессенджер для личных и групповых разговоров. Интерфейс адаптирован для телефонов и компьютеров; сообщения и изображения шифруются в браузере до отправки.

## Возможности

- регистрация, вход и редактирование профиля;
- поиск пользователей и создание личных и групповых чатов;
- обмен сообщениями в реальном времени, индикатор набора текста, статусы онлайн и непрочитанные сообщения;
- история с подгрузкой более ранних сообщений, отметки о прочтении;
- отправка изображений (до 700 КБ) и просмотр на весь экран;
- сквозное шифрование текста и изображений: AES-GCM для содержимого, RSA-OAEP для передачи ключа участникам;
- мобильная раскладка, поиск по чатам и фильтр непрочитанных.

## Структура

- `frontend/` — React, TypeScript, Vite, Tailwind CSS, Socket.IO client.
- `backend/` — Node.js, Express, Socket.IO; чаты, сообщения и realtime.
- `python-api/` — FastAPI; регистрация, профиль, публичные ключи и Socket.IO-присутствие/индикатор набора текста.
- Оба API используют одну MongoDB и должны проверять токены одним и тем же `JWT_SECRET`.

## Локальный запуск

Нужны Node.js, Python 3.10+ и MongoDB. Сначала создайте локальные `.env` из примеров:

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item python-api\.env.example python-api\.env
Copy-Item frontend\.env.example frontend\.env
```

Убедитесь, что `JWT_SECRET` в `backend\.env` и `python-api\.env` совпадает, а `MONGO_URI` указывает на одну базу. Примеры предназначены только для локальной разработки — для развертывания задайте собственный случайный секрет.

Запустите каждый сервис в отдельном терминале:

```powershell
cd python-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:socket_app --reload --port 8000
```

```powershell
cd backend
npm install
npm run dev
```

```powershell
cd frontend
npm install
npm run dev
```

Socket.IO использует тот же Python API origin и JWT secret. `frontend/.env.example` задаёт локальные адреса; для production задайте `VITE_API_URL` и `VITE_SOCKET_URL` на origin Python API перед сборкой фронтенда.

Для production Python API также должен запускаться через Socket.IO ASGI-приложение: `uvicorn main:socket_app --host 0.0.0.0 --port $PORT`. Укажите эту команду в настройках Start Command хостинга; запуск `main:app` не обслуживает Socket.IO.

## Сборка

```powershell
cd frontend
npm run build
npm run lint
```

Фронтенд использует `HashRouter` и относительные asset-пути, поэтому статическую сборку можно размещать как в корне домена, так и в подпапке, например на GitHub Pages.
