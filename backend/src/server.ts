import "dotenv/config";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerAuthRoutes } from "./routes/auth";
import { registerHourRoutes } from "./routes/hours";
import { registerListingRoutes } from "./routes/listings";
import { registerConnectRoutes } from "./routes/connect";
import { registerProfileRoutes } from "./routes/profile";
import { registerReservationRoutes } from "./routes/reservations";
import { registerReviewRoutes } from "./routes/reviews";

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
})

const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

await app.register(cors, {
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
});

app.get("/health", async () => {
    return { ok: true };
});

await registerAuthRoutes(app);
await registerConnectRoutes(app);
await registerListingRoutes(app);
await registerReviewRoutes(app);
await registerReservationRoutes(app);
await registerProfileRoutes(app);
await registerHourRoutes(app);

const port = Number(process.env.BACKEND_PORT ?? 3000);
const host = process.env.BACKEND_HOST ?? "0.0.0.0";

try {
    await app.listen({ port, host });
} catch (error) {
    app.log.error(error);
    process.exit(1);
}
