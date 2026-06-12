import express from 'express';
import { CreditOSEventListener } from './event-listener';

const app = express();
const PORT = process.env.PORT || 8004;

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'core-ledger-loan' });
});

async function bootstrap() {
  // Initialize the Event Listener
  const listener = new CreditOSEventListener();
  await listener.init();
  
  // Start Express server
  app.listen(PORT, () => {
    console.log(`[Core-Ledger Service] Running on port ${PORT}`);
  });

  // Start polling Redis Stream
  listener.startListening();
}

bootstrap().catch(err => {
  console.error('[Core-Ledger Service] Bootstrap failed:', err);
  process.exit(1);
});
