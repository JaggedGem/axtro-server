import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import { mkdirSync } from 'node:fs';

const app = Fastify({ logger: true });
const prisma = new PrismaClient();

await app.register(cors, { origin: true, credentials: true });
await app.register(jwt, { secret: process.env.JWT_SECRET! });
await app.register(multipart);

mkdirSync(process.env.STORAGE_DIR!, { recursive: true });

// health
app.get('/health', async () => ({ ok: true }));

// routes (auth, files, folders) in separate files...
// e.g. app.register(authRoutes, { prefix: '/auth' });

app.listen({ port: 4000, host: '0.0.0.0' });
