import crypto from "crypto";
import { Octokit } from "@octokit/rest";
import pool from "../config/db.js";
import CryptoJS from 'crypto-js';


// Configurar a chave de criptografia (mesma usada em githubOAuthController.js)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "your-32-character-secret-key!!";
const ALGORITHM = "aes-256-cbc";

// Função para descriptografar token
function decrypt(encryptedText) {
  const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}
// Função principal para atualizar GitHub
export async function updateGitHubIfIntegrated(userId, id_projeto, htmlContent, commitMessage = "Atualização automática do site") {
  try {
    // 1. Verificar se existe integração para este projeto
    const integrationQuery = `
      SELECT * FROM github_integrations 
      WHERE id_projeto = $1 AND user_id = $2
    `;
    const integrationResult = await pool.query(integrationQuery, [id_projeto, userId]);

    // Se não tem integração, retorna sem fazer nada
    if (integrationResult.rows.length === 0) {
      console.log(`Nenhuma integração GitHub encontrada para id_projeto: ${id_projeto}`);
      return { updated: false, message: "Sem integração GitHub" };
    }

    const integration = integrationResult.rows[0];
    console.log(`✅ Integração encontrada: ${integration.repo_full_name}`);

    // 2. Buscar token OAuth do usuário
    const tokenQuery = `
      SELECT access_token FROM github_connections 
      WHERE user_id = $1
    `;
    const tokenResult = await pool.query(tokenQuery, [userId]);

    if (tokenResult.rows.length === 0) {
      console.error("Token GitHub não encontrado para o usuário");
      return { updated: false, message: "Token GitHub não encontrado" };
    }

    // 3. Descriptografar token
    const encryptedToken = tokenResult.rows[0].access_token;
    const decryptedToken = decrypt(encryptedToken);

    // 4. Inicializar Octokit com o token
    const octokit = new Octokit({ auth: decryptedToken });

    // 5. Separar owner e repo do repo_full_name (formato: username/repo-name)
    const [owner, repo] = integration.repo_full_name.split('/');

    // 6. Buscar o SHA do arquivo index.html atual
    const currentFile = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: 'index.html',
    });

    // 7. Atualizar o arquivo no GitHub
    await octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'index.html',
      message: commitMessage,
      content: Buffer.from(htmlContent).toString('base64'),
      sha: currentFile.data.sha,
    });

    console.log(`✅ Repositório atualizado com sucesso: ${integration.repo_url}`);

    return {
      updated: true,
      message: "Repositório GitHub atualizado com sucesso",
      repoUrl: integration.repo_url
    };

  } catch (error) {
    console.error("Erro ao atualizar repositório GitHub:", error);
    return {
      updated: false,
      message: error.message || "Erro ao atualizar GitHub",
      error: error
    };
  }
}