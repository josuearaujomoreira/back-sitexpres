// integracao_directadmin.js
import axios from "axios";
import ftp from "basic-ftp";

// Função para criar conta no DirectAdmin
export async function criarSubdominioDirectAdmin(subdominio, dominioPrincipal) {
  try {
    const url = `https://sitexpres.com.br:2222/CMD_API_SUBDOMAIN`;
    const params = new URLSearchParams({
      action: "create",
      domain: 'sitexpres.com.br',       // ex: sitexpres.com.br
      subdomain: subdominio
    });

    const response = await axios.post(url, params.toString(), {
      auth: {
        username: process.env.user_directamin, // seu usuário do DirectAdmin
        password: process.env.pass_directamin,
      },
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });

    return response.data;
  } catch (err) {
    console.error("Erro ao criar subdomínio:", err);
    throw err;
  }
}

// Função para enviar HTML via FTP
export async function enviarHTMLSubdominio(host, usuario, senha, subdominio, html) {
  const client = new ftp.Client();
  client.ftp.verbose = true;
  try {
    await client.access({ host, user: usuario, password: senha, secure: false });
    const path = `/domains/sitexpres.com.br/public_html/${subdominio}/index.html`;
    await client.uploadFrom(Buffer.from(html, "utf-8"), path);
    console.log("HTML enviado com sucesso!");
  } catch (err) {
    console.error("Erro ao enviar HTML:", err);
    throw err;
  } finally {
    client.close();
  }
}
