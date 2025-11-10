import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  secure: false, // true se usar 465
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  },
});

export const sendPasswordResetEmail = async (to, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  
  const mailOptions = {
    from: process.env.MAIL_FROM,
    to,
    subject: "Recuperação de senha - SiteExpres",
    html: `
      <div style="font-family:Arial, sans-serif; padding:20px; max-width:500px; margin:auto;">
        <h2>🔐 Recuperação de Senha</h2>
        <p>Olá! Recebemos uma solicitação para redefinir sua senha.</p>
        <p>Clique no botão abaixo para criar uma nova senha:</p>
        <a href="${resetUrl}" 
           style="display:inline-block; padding:10px 20px; background:#007BFF; color:white; text-decoration:none; border-radius:6px;">
           Redefinir Senha
        </a>
        <p style="margin-top:15px;">Se você não solicitou esta ação, ignore este email.</p>
        <p style="font-size:12px; color:gray;">Este link expira em 1 hora.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};
