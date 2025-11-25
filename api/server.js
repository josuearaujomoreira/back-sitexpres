import express from "express";
import cors from "cors";
import 'dotenv/config';
import pool from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import siteRoutes from "./routes/siteRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import paymentsRoutes from "./routes/paymentsRoutes.js";
import githubIntegrationRoutes from "./routes/githubIntegrationRoutes.js";
 
import path from "path";
import { fileURLToPath } from "url";

const app = express();

// Middlewares globais
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:8080', 'https://seusitefrontend.com', 'https://app.sitexpres.com.br', 'https://back.sitexpres.com.br', 'https://site-ai-launchpad.lovable.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.urlencoded({ extended: true }));

// Teste de conexão
app.get("/dbtest", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "Conectado ao banco!", hora: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Rotas principais
app.use("/api/reset-password", authRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/sites", siteRoutes);
app.use("/api/user", userRoutes);
app.use("/api/integrations/github", githubIntegrationRoutes);
app.use("/api/pagamento/", paymentsRoutes);

 
 


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Servir arquivos estáticos da pasta uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Rota padrão
app.get("/", (req, res) => {
  res.send("awaiting command");
});

app.get('/teste-lento', async (req, res) => {
  console.log("🔹 Requisição recebida em /teste-lento");

  // Espera 120 segundos (2 minutos)
  await new Promise(resolve => setTimeout(resolve, 150000));

  res.json({
    success: true,
    message: "✅ Endpoint lento respondeu depois de 120 segundos!"
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
