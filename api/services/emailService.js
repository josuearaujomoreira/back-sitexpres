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

export const sendPasswordResetEmail = async (to, assunto, mensagem) => {
  /* const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`; */
  
  const mailOptions = {
    from: process.env.MAIL_FROM,
    to,
    subject: assunto,
    html: mensagem
  };

  await transporter.sendMail(mailOptions);
};
