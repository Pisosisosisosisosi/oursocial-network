# Backend (Node.js + Express + Socket.IO)

## Установка
npm install

## Запуск
npm run dev

## Переменные окружения
Скопировать `.env.example` в `.env` и заполнить.

## Структура
- `src/index.js` — точка входа
- `src/app.js` — Express (Артём)
- `src/socket.js` — Socket.IO (Дариус)
- `src/routes/` — REST API (Артём)
- `src/middleware/` — middleware (Артём)
- `src/services/db.js` — подключение MongoDB
- `src/services/messages.js` — работа с сообщениями (Дариус)