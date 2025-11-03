// integracao_directadmin.js
import axios from "axios";
import ftp from "basic-ftp";
import { Readable } from "stream";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

// Função para criar conta no DirectAdmin
export async function criarSubdominioDirectAdmin(subdominio, dominioPrincipal) {
  try {
    const url = `https://srv3br.com.br:2222/CMD_API_SUBDOMAIN`;
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

 

export async function enviarHTMLSubdominio(host, usuario, senha, subdominio, html) {
    if (!host || !usuario || !senha || !subdominio || !html) {
        throw new Error("Parâmetros inválidos para enviarHTMLSubdominio");
    }

    const client = new ftp.Client();
    client.ftp.verbose = true;

    try {
        // Conecta no FTP
        await client.access({ host, user: usuario, password: senha, secure: false });

        // Caminho remoto
        const remoteDir = `/domains/${subdominio}/public_html`;

        // Garante que o diretório exista
        await client.ensureDir(remoteDir);

        // Cria um stream a partir da string HTML
        const htmlStream = Readable.from([html]);

        // Envia o arquivo
        await client.uploadFrom(htmlStream, `${remoteDir}/index.html`);

        console.log(`✅ HTML enviado com sucesso para ${subdominio}!`);
    } catch (err) {
        console.error("❌ Erro ao enviar HTML:", err);
        throw err;
    } finally {
        client.close();
    }
}

// Consulta de Subdominio 
export async function subdominioExiste(subdominio, dominioPrincipal, usuarioDono ='sitexpres') {
  try {
    console.log("\n===============================");
    console.log("🔍 VERIFICAÇÃO DE SUBDOMÍNIO");
    console.log("===============================");
    console.log(`🔑 Usuário admin: ${process.env.user_directamin}`);
    console.log(`🌐 Domínio: ${dominioPrincipal}`);
    console.log(`👤 Dono do domínio: ${usuarioDono}`);
    console.log(`🧩 Subdomínio a verificar: ${subdominio}`);
    console.log("-------------------------------");

    // ✅ GET correto com action=list
    const url = `https://${process.env.host_directadmin}:2222/CMD_API_SUBDOMAINS?action=list&domain=${dominioPrincipal}&owner=${usuarioDono}`;

    const response = await axios.get(url, {
      auth: {
        username: process.env.user_directamin,
        password: process.env.pass_directamin,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    console.log("📩 Resposta bruta do DirectAdmin:");
    console.log(response.data);

    // Extrai subdomínios retornados
    const matches = [...response.data.matchAll(/subdomain=([\w\d-]+)/g)];
    const subdominios = matches.map((m) => m[1]);

    console.log("\n📜 Subdomínios encontrados:");
    console.log(subdominios.length > 0 ? `✅ ${subdominios.join(", ")}` : "❌ Nenhum subdomínio encontrado");

    const existe = subdominios.includes(subdominio);

    console.log("\n📊 RESULTADO FINAL");
    console.log("-------------------------------");
    console.log(existe ? `✅ O subdomínio "${subdominio}" já existe!` : `🆕 O subdomínio "${subdominio}" ainda não existe.`);
    console.log("===============================\n");

    return existe;
  } catch (err) {
    console.error("\n❌ Erro ao verificar subdomínio:", err.message);
    if (err.response?.data) {
      console.error("🧾 Resposta do servidor:", err.response.data);
    }
    console.log("===============================\n");
    throw err;
  }
}
