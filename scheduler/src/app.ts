import cors from 'cors';
import express from 'express';

import type { Express } from 'express';

const app: Express = express();

// health check
app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.use(cors());
app.use(express.json());

export { app };
