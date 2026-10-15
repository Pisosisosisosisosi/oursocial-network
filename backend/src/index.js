require('dotenv').config();
const http = require('http');
const createApp = require('./app');
const { initSocket } = require('./socket');
const { connectDB } = require('./services/db');

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    // await connectDB();
    // console.log('✅ MongoDB connected');
    console.log('⚠️ Skipping MongoDB for now');

    const app = createApp();
    const server = http.createServer(app);

    initSocket(server);

    server.listen(PORT, () => {
      console.log(`✅ Backend running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Failed to start backend:', err);
    process.exit(1);
  }
}

start();