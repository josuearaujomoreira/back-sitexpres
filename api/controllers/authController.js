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

    // Validação básica do email
    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: "Email inválido"
      });
    }

    console.log(`🔐 Solicitação de reset de senha para: ${email}`);

    // Verifica se o email existe
    const result = await pool.query(
      "SELECT id, email FROM users WHERE email = $1", 
      [email.toLowerCase().trim()]
    );

    // Por segurança, sempre retorna a mesma mensagem (evita enumerar usuários)
   

    if (result.rows.length === 0) {
      console.log(`⚠️ Tentativa de reset para email não cadastrado: ${email}`);
      // Retorna sucesso mesmo se não existir (segurança)
      return res.json({
        success: false,
        message: 'Usuário não encontrado!'
      });
    }

    const user = result.rows[0];

    // Limpa tokens antigos deste usuário antes de criar um novo
    await pool.query(
      "DELETE FROM password_reset_tokens WHERE user_id = $1",
      [user.id]
    );

    // Cria um token de reset (não um token de autenticação!)
    const resetToken = jwt.sign(
      { 
        userId: user.id,
        type: 'password_reset', // Marca o tipo do token
        email: user.email 
      }, 
      JWT_SECRET, 
      { expiresIn: "1h" }
    );

    // Salva o token no banco
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at, used) VALUES ($1, $2, NOW() + INTERVAL '1 hour', false)",
      [user.id, resetToken]
    );

    // Log do token para desenvolvimento (remover em produção)
    console.log(`📧 Token de recuperação gerado para ${email}`);
    console.log(`🔗 Use este token na confirmação: ${resetToken}`);
    
    // TODO: Aqui você deve integrar um serviço de email (como Resend, SendGrid, etc)
    // Exemplo de URL que seria enviada por email:
    // const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    res.json({
      success: true,
      message: genericMessage
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
