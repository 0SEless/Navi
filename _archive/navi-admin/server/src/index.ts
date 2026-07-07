import express from "express";
import cors from "cors";
import graphRouter from "./routes/graph.js";
import directoryRouter from "./routes/directory.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001", 10);

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }));
app.use(express.json({ limit: "10mb" }));

// Routes
app.use("/api/graph", graphRouter);
app.use("/api/directory", directoryRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`[navi-server] listening on http://localhost:${PORT}`);
});
