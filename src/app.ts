import express, { Request, Response } from 'express';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { Server } from 'socket.io';
import { createServer } from 'http';
import { URL } from 'url';
import bcrypt from 'bcryptjs';
import { response } from './response';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const httpServer = createServer(app);

const io = new Server(httpServer);

const disallowedHeaders = new Set(['accept', 'content-type', 'user-agent', 'content-length', 'host', 'connection']);

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

const nSeconds = Number(process.env.NO_OF_DAYS_EXPIRY) * 24 * 60 * 60;

interface RedisDoc {
  url: string;
  hashedPassword: string;
}

app.post('/api/v1/get-url', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    let url;

    //create a random code and use it to generate a url
    const code = getRandomString(Number(process.env.CODE_LENGTH));
    url = `${req.protocol + '://' + req.headers.host}/${code}/webhook`;
    const hashedPassword = await bcrypt.hash(password, 10);
    const data: RedisDoc = { url, hashedPassword };
    await redis.set(code, JSON.stringify(data), 'EX', nSeconds);

    return response(res, 201, 'fetched webhook url successfully', { url });
  } catch (error) {
    console.log(error);
    return response(res, 500, 'something went very wrong');
  }
});

app.post('/api/v1/authenticate', async (req: Request, res: Response) => {
  const { code, password } = req.body;
  if (!code) return response(res, 400, 'code is required');
  if (!password) return response(res, 400, 'password is required');

  const data = await redis.get(code);
  if (!data) return response(res, 404, 'code not found');

  const { hashedPassword, url } = JSON.parse(data) as RedisDoc;

  const isMatch = await bcrypt.compare(password, hashedPassword);
  if (!isMatch) return response(res, 401, 'invalid code or password');

  return response(res, 200, 'Authentication successful', { code, url });
});

app.all('/:code/webhook', async (req: Request, res: Response) => {
  const { code } = req.params;
  const { method, headers, query, body, params, originalUrl } = req;
  const headersCopy: any = {};

  for (const key in headers) {
    if (!disallowedHeaders.has(key.toLowerCase())) {
      headersCopy[key] = headers[key];
    }
  }
  const data = {
    originalUrl,
    method,
    headers: headersCopy,
    query,
    body,
    params,
  };

  if (process.env.NODE_ENV === 'development') console.log(data);

  io.sockets.emit(code, data);
  res.status(200).json({ message: data });

  const doc = await redis.get(code);
  if (doc) await redis.set(code, doc, 'EX', nSeconds);
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
