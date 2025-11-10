import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import { sendMail } from "../services/emailService.js";

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


    const result_email = await pool.query(
      "SELECT * FROM email_templates WHERE name = $1 LIMIT 1",
      ['welcome']
    );


    // Conteúdo do HTML vindo do banco
    let texto_email = result_email.rows[0].body;

    // Substitui o placeholder pelo link real
    // Pega o primeiro nome do usuário
    const firstName = user.name.split(' ')[0];
    const texto_email_editado = texto_email.replace(/{{user_name}}/g, firstName);

    // Envia o e-mail
    await sendMail(user.email, 'Bem vindo(a)!', texto_email_editado);


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

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: "Email inválido"
      });
    }

    const result = await pool.query(
      "SELECT id, email FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: false,
        message: 'Usuário não encontrado!'
      });
    }

    const user = result.rows[0];

    await pool.query(
      "DELETE FROM password_reset_tokens WHERE user_id = $1",
      [user.id]
    );

    const resetToken = jwt.sign(
      {
        userId: user.id,
        type: 'password_reset',
        email: user.email
      },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at, used) VALUES ($1, $2, NOW() + INTERVAL '1 hour', false)",
      [user.id, resetToken]
    );

    // Envia o e-mail para o usuário

    //Consulta template no banco 
    const result_email = await pool.query(
      "SELECT * FROM email_templates WHERE name = $1 LIMIT 1",
      ['Recuperação de Senha']
    );

    // Verifica se encontrou
    if (result_email.rows.length === 0) {
      throw new Error("Template de e-mail não encontrado!");
    }

    // Conteúdo do HTML vindo do banco
    let texto_email = result_email.rows[0].body;

    // Substitui o placeholder pelo link real
    const link_recover = `https://app.sitexpres.com.br/${resetToken}`;
    const texto_email_editado = texto_email.replace(/\[link_reset\]/g, link_recover);

    // Envia o e-mail
    await sendMail(user.email, 'Recuperação de Senha', texto_email_editado);

    res.json({
      success: true,
      message: "Um link de recuperação foi enviado para seu e-mail."
    });

  } catch (error) {
    console.error("❌ Erro em resetpasswd:", error);
    res.status(500).json({
      success: false,
      message: "Erro ao processar recuperação de senha"
    });
  }
};

export const confirmResetPassword = async (req, res) => {

}


// No seu authController.js

export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token não fornecido'
      });
    }

    // Valida o token usando a constante JWT_SECRET já definida
    const decoded = jwt.verify(token, JWT_SECRET);

    // Usa pool ao invés de db
    const user = await pool.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (user.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Usuário não encontrado'
      });
    }

    return res.json({
      success: true,
      user: user.rows[0]
    });

  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Token inválido ou expirado'
    });
  }
};
