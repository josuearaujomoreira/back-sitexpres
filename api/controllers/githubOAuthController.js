import { Octokit } from '@octokit/rest';
import CryptoJS from 'crypto-js';

import pool from "../config/db.js";



const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-secret-key-min-32-chars-long';

function encrypt(text) {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

function decrypt(encryptedText) {
  const bytes = CryptoJS.AES.decrypt(encryptedText, ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// 1. Iniciar OAuth - retorna URL de autorização
export async function authorize(req, res) {
  try {
    const state = Buffer.from(JSON.stringify({
      userId: req.userId,
      timestamp: Date.now()
    })).toString('base64');

    console.log('==>' + req.userId)

    const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
    githubAuthUrl.searchParams.append('client_id', process.env.GITHUB_CLIENT_ID);
    githubAuthUrl.searchParams.append('redirect_uri', process.env.GITHUB_REDIRECT_URI);
    githubAuthUrl.searchParams.append('scope', 'repo user:email');
    githubAuthUrl.searchParams.append('state', state);

    // Retorna JSON com a URL em vez de fazer redirect
    res.json({ authUrl: githubAuthUrl.toString() });
  } catch (error) {
    console.error('Erro no authorize:', error);
    res.status(500).json({ error: error.message });
  }
}

// 2. Callback do GitHub - recebe o código e salva o token
export async function callback(req, res) {
  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).send('Código ou state inválido');
  }

  try {
    // Decodifica o state para pegar o userId
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId } = stateData;

    // Troca o code pelo access_token
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: process.env.GITHUB_REDIRECT_URI
      })
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      throw new Error(tokenData.error_description || 'Erro ao obter access token');
    }

    const { access_token, token_type, scope } = tokenData;

    // Busca informações do usuário no GitHub
    const octokit = new Octokit({ auth: access_token });
    const { data: githubUser } = await octokit.users.getAuthenticated();

    // Salva no banco (criptografado)
    const encryptedToken = encrypt(access_token);

    await pool.query(`
      INSERT INTO github_connections (user_id, github_username, access_token, token_type, scope)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        github_username = $2,
        access_token = $3,
        token_type = $4,
        scope = $5,
        updated_at = NOW()
    `, [userId, githubUser.login, encryptedToken, token_type, scope]);

    // Fecha o popup e notifica a janela pai
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'github-oauth-success'
              }, '*');
              window.close();
            } else {
              window.location.href = 'https://app.sitexpres.com.br/dashboard';
            }
          </script>
          <p>Conexão realizada com sucesso! Você pode fechar esta janela.</p>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('Erro no callback OAuth:', error);
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'github-oauth-error',
                message: '${error.message}'
              }, '*');
              window.close();
            }
          </script>
          <p>Erro: ${error.message}</p>
        </body>
      </html>
    `);
  }
}

// 3. Verificar se o usuário já conectou o GitHub
export async function checkConnection(req, res) {
  try {
    const result = await pool.query(
      'SELECT github_username FROM github_connections WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      connected: result.rows.length > 0,
      username: result.rows[0]?.github_username || null
    });
  } catch (error) {
    console.error('Erro ao verificar conexão:', error);
    res.status(500).json({
      connected: false,
      error: error.message
    });
  }
}

// 4. Criar repositório (usando OAuth ou token manual)
export async function createRepo(req, res) {
  try {
    const {
      githubToken,
      repoName,
      description,
      htmlContent,
      siteName,
      siteId,
      idProjeto
    } = req.body;

    if (!repoName || !htmlContent) {
      return res.status(400).json({
        success: false,
        message: 'Campos obrigatórios: repoName, htmlContent'
      });
    }

    let accessToken = githubToken;

    // Se não veio token manual, busca o token OAuth do banco
    if (!accessToken) {
      const result = await pool.query(
        'SELECT access_token FROM github_connections WHERE user_id = $1',
        [req.userId]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'GitHub não conectado. Conecte sua conta primeiro.'
        });
      }

      accessToken = decrypt(result.rows[0].access_token);
    }

    const octokit = new Octokit({ auth: accessToken });

    const { data: user } = await octokit.users.getAuthenticated();

    const { data: repo } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: description || `Site gerado pelo SiteXpress`,
      private: false,
      auto_init: false
    });

    // Cria index.html
    await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: repoName,
      path: 'index.html',
      message: 'Initial commit - Site gerado pelo SiteXpress',
      content: Buffer.from(htmlContent).toString('base64'),
    });

    // Cria README.md
    const readmeContent = `# ${siteName || repoName}

        Este site foi gerado automaticamente pelo [SiteXpress](https://sitexpres.com.br).

        ## Visualizar o Site

        Acesse: [https://${user.login}.github.io/${repoName}](https://${user.login}.github.io/${repoName})

        ## Habilitar GitHub Pages

        1. Vá em Settings > Pages
        2. Em "Source", selecione "main" branch
        3. Clique em "Save"

        ---
        Powered by SiteXpress ✨`;

    await octokit.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: repoName,
      path: 'README.md',
      message: 'Add README',
      content: Buffer.from(readmeContent).toString('base64')
    });

 
    // Buscar id_projeto automaticamente
    const projectQuery = await pool.query(
      'SELECT id_projeto FROM generated_sites WHERE id = $1',
      [siteId]
    );

    if (projectQuery.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: `Nenhum id_projeto encontrado para o siteId: ${siteId}`
      });
    }

    const idProjetoDB = projectQuery.rows[0].id_projeto;

    const saveIntegrationQuery = `
  INSERT INTO github_integrations 
    (user_id, site_id, id_projeto, repo_name, repo_url, repo_full_name)
  VALUES 
    ($1, $2, $3, $4, $5, $6)
  ON CONFLICT (site_id) 
  DO UPDATE SET
    repo_name = EXCLUDED.repo_name,
    repo_url = EXCLUDED.repo_url,
    repo_full_name = EXCLUDED.repo_full_name,
    updated_at = CURRENT_TIMESTAMP
  RETURNING *
`;

    const integrationResult = await pool.query(saveIntegrationQuery, [
      req.userId,
      siteId,
      idProjetoDB,
      repoName,
      repo.html_url,
      repo.full_name
    ]);


    console.log("✅ Integração GitHub salva:", integrationResult.rows[0]);


    return res.json({
      success: true,
      message: 'Repositório criado com sucesso',
      repoUrl: repo.html_url,
      repoName: repo.name,
      owner: user.login
    });

  } catch (error) {
    console.error('Erro ao criar repositório:', error);

    if (error.status === 401) {
      return res.status(401).json({
        success: false,
        message: 'Token do GitHub inválido ou expirado'
      });
    }

    if (error.status === 422 && error.message.includes('name already exists')) {
      return res.status(422).json({
        success: false,
        message: 'Já existe um repositório com este nome'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erro ao criar repositório no GitHub',
      error: error.message
    });
  }
}

// 5. Desconectar GitHub (opcional)
export async function disconnect(req, res) {
  try {
    await pool.query(
      'DELETE FROM github_connections WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      success: true,
      message: 'GitHub desconectado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao desconectar:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
