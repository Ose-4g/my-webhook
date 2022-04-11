import express, { Request, Response } from 'express';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { URL } from 'url';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const httpServer = createServer(app);

const io = new Server(httpServer);

const parsedUrl = new URL(process.env.REDIS_URL as string);
const redis = new Redis({
  host: parsedUrl.hostname,
  port: Number(parsedUrl.port),
  password: parsedUrl.password,
  username: parsedUrl.username,
});

const getRandomString = (length: number) => {
  const val = crypto.randomBytes(32).toString('hex');
  return val.substring(0, length);
};

app.get('/api/v1/get-url', async (req: Request, res: Response) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ message: 'email is required, please provide your email' });
  }
  try {
    let url = await redis.get(email as string);
    let status = 200;
    if (!url) {
      const code = getRandomString(Number(process.env.CODE_LENGTH));
      url = `${req.protocol + '://' + req.headers.host}/${code}/webhook`;
      status = 201;
    }
    const nSeconds = Number(process.env.NO_OF_DAYS_EXPIRY) * 24 * 60 * 60;
    await redis.set(email as string, url, 'EX', nSeconds);

    return res.status(status).json({ mesage: 'fetched webhook url successfully', url });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ mesage: 'something went very wrong' });
  }
});

app.all('/:code/webhook', (req: Request, res: Response) => {
  const { code } = req.params;
  const { method, headers, query, body, params, originalUrl } = req;
  const data = {
    originalUrl,
    method,
    headers,
    query,
    body,
    params,
  };
  io.sockets.emit(code, data);
  res.status(200).json({ message: data });
});

app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ message: 'specified url not found' });
});

const PORT = process.env.PORT || 3089;

httpServer.listen(PORT, () => {
  console.log(`
        ##########################################

        #### App is listening on port ${PORT}#####
        ##########################################`);
});

io.on('connection', (socket) => {});
