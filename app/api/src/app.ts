import express from "express";
import type { ErrorRequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import roomsRouter from "./routes/room.js";
import runRouter from "../src/routes/run.js";
import authRouter from "../src/routes/auth.js"

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  })
);

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRouter)
app.use("/api/rooms", roomsRouter);
app.use("/api/run", runRouter);


const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);

  res.status(500).json({
    error: "An unexpected server error occurred",
  });
};

app.use(errorHandler);

export default app;