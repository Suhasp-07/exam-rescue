import "dotenv/config";
import express from "express";
import cors from "cors";
import { rescueRouter } from "./routes/rescue";
import { checkWebcmdAvailable } from "./utils/webcmdClient";

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (_req, res) => {
  const webcmd = await checkWebcmdAvailable();
  res.json({ ok: true, webcmd });
});

app.use("/api/rescue", rescueRouter);

app.listen(PORT, () => {
  console.log(`🚨 Exam Rescue backend running at http://localhost:${PORT}`);
  checkWebcmdAvailable().then((r) => {
    console.log(r.available ? "✓ webcmd CLI detected." : `⚠ ${r.message}`);
  });
});
