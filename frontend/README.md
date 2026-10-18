# Frontend

React + TypeScript + Vite client for the OurSocial messenger.

## Development

Create `.env` from `.env.example`, then run:

```powershell
npm install
npm run dev
```

The client uses the Python API for authentication, profile data and public keys, and the Node.js API plus Socket.IO for chat functionality. Configure the service URLs with `VITE_API_URL`, `VITE_MESSENGER_API_URL` and `VITE_SOCKET_URL`.

From this directory, `npm run build` runs the TypeScript project build and creates the deployable static app in `dist/`. `npm run lint` runs Oxlint.
