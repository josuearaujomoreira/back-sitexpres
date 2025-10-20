import express from "express";
import cors from "cors";
import 'dotenv/config';
import pool from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import siteRoutes from "./routes/siteRoutes.js";

const app = express();

// Middlewares globais
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:8080', 'https://seusitefrontend.com', 'https://back.sitexpres.com.br', 'https://site-ai-launchpad.lovable.app/'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

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
app.use("/api/auth", authRoutes);
app.use("/api/sites", siteRoutes);

// Rota padrão
app.get("/", (req, res) => {
  res.send("🚀 API Node.js rodando com Docker e PostgreSQL!");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
