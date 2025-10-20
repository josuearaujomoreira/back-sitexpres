import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

const JWT_SECRET = process.env.JWT_SECRET || "seu_secret_aqui_MUDE_EM_PRODUCAO";

export const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const userExists = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, message: "Email já cadastrado" });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
      [name, email, password_hash]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({ success: true, token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Erro ao cadastrar usuário" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0)
      return res.status(401).json({ success: false, message: "Email ou senha incorretos" });

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword)
      return res.status(401).json({ success: false, message: "Email ou senha incorretos" });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Erro ao fazer login" });
  }
};

export const resetpasswd = async (req, res) => {
  try {
    const { email } = req.body;

    // Verifica se o email existe
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);

    if (result.rows.length === 0) {

      console.log('Email inválido:'+email)

      // Por segurança, retorna sucesso mesmo se o email não existir
      return res.json({
        success: true,
        message: "Usuário não encontrado"
      });
    }

    const user = result.rows[0];

    // Cria um token temporário (1 hora)
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "1h" });

    // Salva o token no banco
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')",
      [user.id, token]
    );

    // Aqui você pode integrar um serviço de envio de email
    console.log(`📧 Token de recuperação para ${email}: ${token}`);

    res.json({
      success: true,
      message: "Email de recuperação enviado (token gerado com sucesso)"
    });
  } catch (error) {
    console.error("Erro em resetpasswd:", error);
    res.status(500).json({ success: false, message: "Erro ao processar recuperação de senha" });
  }
};
export const confirmResetPassword = async (req, res) => {

}
