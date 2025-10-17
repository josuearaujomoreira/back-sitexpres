import express from "express";
import pg from "pg";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "cors";
import 'dotenv/config'; 

const { Pool } = pg;
const app = express();

// Middlewares
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:8080', 'https://seusitefrontend.com', 'https://back.sitexpres.com.br','https://site-ai-launchpad.lovable.app/'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));


// Configuração do banco
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
});


const JWT_SECRET = process.env.JWT_SECRET || "seu_secret_aqui_MUDE_EM_PRODUCAO";

// Middleware de autenticação
const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token não fornecido' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Token inválido' });
  }
};

// Rota teste
app.get("/", (req, res) => {
  res.send("🚀 API Node.js rodando com Docker e PostgreSQL!");
});

// Rota para testar conexão ao banco
app.get("/dbtest", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ status: "Conectado ao banco!", hora: result.rows[0].now });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// ============ ROTAS DE AUTENTICAÇÃO ============

// POST /api/auth/register - Cadastro
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Verificar se email já existe
    const userExists = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (userExists.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Email já cadastrado'
      });
    }

    // Hash da senha
    const password_hash = await bcrypt.hash(password, 10);

    // Criar usuário
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, password_hash]
    );

    const user = result.rows[0];

    // Gerar token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Erro ao cadastrar usuário'
    });
  }
});

// POST /api/auth/login - Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Buscar usuário
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos'
      });
    }

    const user = result.rows[0];

    // Verificar senha
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: 'Email ou senha incorretos'
      });
    }

    // Gerar token
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Erro ao fazer login'
    });
  }
});

// POST /api/auth/reset-password - Recuperação de senha
app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { email } = req.body;

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      // Por segurança, retorna sucesso mesmo se email não existir
      return res.json({
        success: true,
        message: 'Email de recuperação enviado'
      });
    }

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'1 hour\')',
      [user.id, token]
    );

    // Aqui você implementaria o envio de email
    console.log(`Token de recuperação para ${email}: ${token}`);

    res.json({
      success: true,
      message: 'Email de recuperação enviado'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Erro ao processar recuperação'
    });
  }
});

// POST /api/auth/reset-password/confirm - Confirmar nova senha
app.post("/api/auth/reset-password/confirm", async (req, res) => {
  try {
    const { token, password } = req.body;

    // Verificar token
    const decoded = jwt.verify(token, JWT_SECRET);

    const tokenResult = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Token inválido ou expirado'
      });
    }

    // Atualizar senha
    const password_hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [password_hash, decoded.userId]);

    // Marcar token como usado
    await pool.query('UPDATE password_reset_tokens SET used = TRUE WHERE token = $1', [token]);

    res.json({
      success: true,
      message: 'Senha alterada com sucesso'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Erro ao alterar senha'
    });
  }
});

// ============ ROTAS DE SITES (exemplo protegido) ============

// GET /api/sites - Listar sites do usuário
app.get("/api/sites", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, prompt, views, created_at FROM generated_sites WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );

    res.json({
      success: true,
      sites: result.rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar sites'
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor rodando na porta ${PORT}`));
