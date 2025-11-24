import pool from "../config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import ftp from "basic-ftp";
import { criarSubdominioDirectAdmin, enviarHTMLSubdominio, subdominioExiste } from "./integracao_directadmin.js";
import dotenv from "dotenv";
dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const USE_GEMINI = false;

//
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 20000;

// Função para gerar cada parte do site
// Função para limpar blocos de markdown ou tags extras
function limparRetorno(codigo) {
  // Remove ```html, ```css, ```js e ```
  codigo = codigo.replace(/```(?:html|css|js)?\n?/gi, "");
  codigo = codigo.replace(/```/g, "");
  return codigo.trim();
}

export async function gerarParte(prompt, parte, req, id_projeto, baseHTML = "") {
  const agora = new Date();
  const ano = agora.getFullYear();

  try {
    // 🔹 Detecta se é criação inicial ou edição
    const isEditing = baseHTML && baseHTML.trim().length > 0;

    // 🔹 Prompt principal da IA — com SEO e boas práticas
    const systemPromptBase = `
    Você é um designer e desenvolvedor web profissional, especialista em SEO técnico e performance.
    Gere código HTML5 completo, responsivo e otimizado em português do Brasil.

    Regras obrigatórias:
    1. O retorno deve ser **apenas código HTML** (sem markdown, sem explicações).
    2. O site deve ser semântico (header, nav, main, footer, etc.).
    3. Inclua meta tags completas (title, description, canonical, OpenGraph, Twitter Card, hreflang pt-BR).
    4. Todas as imagens devem ter alt descritivo e srcset/sizes apropriados.
    5. Utilize placeholders relevantes (source.unsplash.com/random/800x600?<tema>).
    6. O rodapé deve conter o ano atual (${ano}) atualizado dinamicamente via JS (<span id="ano"></span> + script).
    7. Utilize apenas HTML, CSS e JS puro (sem frameworks).

    ⚠️ Regras adicionais:
    - O HTML deve ser coerente com o prompt do cliente.
    - **Nunca remova** elementos (imagens, textos, seções) existentes, a menos que o prompt peça claramente.
    - **Mantenha todas as imagens, textos e estrutura** que não foram mencionados como alterados.
    `;

    // 🔹 Se estiver editando, insere o HTML base no contexto
    const systemPrompt = isEditing
      ? `${systemPromptBase}

Você está editando um site já existente.  
HTML atual:
${baseHTML}

Solicitação do cliente:
${prompt}

🧠 Instruções:
- Apenas modifique, adicione ou substitua o que foi pedido no prompt.
- Não apague ou altere conteúdo que não foi mencionado.
- Preserve todas as imagens, seções e estilos atuais.
- Retorne o HTML completo atualizado.`
      : `${systemPromptBase}

Descrição do site:
${prompt}

🧠 Gere o HTML completo seguindo todas as boas práticas acima.`;

    let html = "";

    // ✅ Seleciona modelo de IA
    if (USE_GEMINI) {
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      const result = await model.generateContent(systemPrompt);
      html = result.response.text();
      return limparRetorno(html);
    } else {
      const stream = await anthropic.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 22000,
        system: "Você é um especialista em HTML, CSS e SEO. Sempre gere apenas código HTML puro.",
        messages: [{ role: "user", content: systemPrompt }],
      });

      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta?.text) {
          html += event.delta.text;
        }
      }

      console.log("##==> HTML FINAL GERADO:", html.slice(0, 500)); // debug
      return limparRetorno(html);
    }
  } catch (error) {
    console.error("Erro ao gerar parte do site:", error);
    if (error?.error?.message) console.error("Mensagem do modelo:", error.error.message);
    if (error?.requestID) console.error("ID da requisição:", error.requestID);
    return "<!-- Erro ao gerar conteúdo -->";
  }
}



// Função principal combinada
// Jobs temporários em memória
export const jobs = {}; // { jobId: { status, result, error } }

export const newsite = async (req, res) => {
  try {
    const { prompt, id_projeto, userId } = req.body;

    console.log(req.body)
    console.log(userId)

    const imageFile = req.file ? `/uploads/images/${req.file.filename}` : null;

    const baseURL = "https://back.sitexpres.com.br/uploads/logos/";
    const imageURL = req.file ? `${baseURL}${req.file.filename}` : null;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, message: "Prompt não enviado" });
    }

    // Cria job
    const jobId = uuidv4();
    jobs[jobId] = { status: "processing", result: null, error: null };
    res.json({ success: true, jobId });

    (async () => {
      let client;
      try {
        client = await pool.connect();

        // Verifica se já existe site gerado
        const existing = await client.query(
          `SELECT id, name, html_content FROM generated_sites 
           WHERE id_projeto = $1 and status = 'ativo'
           ORDER BY created_at DESC LIMIT 1`,
          [id_projeto]
        );

        const primeiraVez = existing.rows.length === 0;
        const baseHTML = primeiraVez ? "" : existing.rows[0].html_content;

        // Monta prompt final para a IA
        const fullPrompt = imageURL
          ? `${prompt}\nUse esta URL da imagem no site: ${imageURL}`
          : prompt;

        const finalPrompt = baseHTML
          ? `HTML atual:\n${baseHTML}\nFaça as alterações solicitadas: ${fullPrompt}`
          : fullPrompt;

        // Gera HTML
        const html = await gerarParte(finalPrompt, "HTML", req, id_projeto, baseHTML); //'<h1>Sitee script gerado por IA</h1>' //

        // Gera nome do subdomínio via IA
        let nomeSubdominio;
        if (primeiraVez) {
          nomeSubdominio = await gerarNomeSubdominio(prompt);
          // Cria subdomínio no DirectAdmin
          await criarSubdominioDirectAdmin(nomeSubdominio, "sitexpres.com.br");

          // Colocar site na tabela de sites
          //Colunas  credits_used,status, metadata pode vim null e title pegar o mesmo do site_name
          // Insere site na tabela 'sites' do painel admin
          const siteUrl = `https://${nomeSubdominio}.sitexpres.com.br`;
          const siteName = `Site de ${nomeSubdominio}`;

          await client.query(
            `INSERT INTO sites 
              (user_id, site_name, site_url, credits_used, status, metadata,id_projeto)
              VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              userId,                    // user_id
              siteName,                  // site_name (mesmo valor que vai para generated_sites)
              siteUrl,                   // site_url (URL completa do site)
              10,                        // credits_used (pode ajustar o valor)
              'active',                  // status
              JSON.stringify({           // metadata (pode adicionar info útil)
                id_projeto: id_projeto,
                subdominio: nomeSubdominio,
                created_by: 'ai_generation'
              }),
              id_projeto
            ]
          );


        } else {
          nomeSubdominio = existing.rows[0].name.replace("Site de ", "").toLowerCase();
        }


        //  Marca todos os registros existentes como inativos
        await client.query(
          `UPDATE generated_sites 
            SET status = 'inativo'
            WHERE id_projeto = $1`,
          [id_projeto]
        );

        await client.query(
          `UPDATE site_prompts 
        SET status = 'inativo'
        WHERE id_projeto = $1`,
          [id_projeto]
        );



        // Insere registro no banco
        const insertSite = await client.query(
          `INSERT INTO generated_sites 
           (user_id, name, prompt, html_content, id_projeto, image_path,subdominio,status)
           VALUES ($1, $2, $3, $4, $5, $6 ,$7, $8)
           RETURNING id, name, prompt, html_content, created_at`,
          [userId, `Site de ${nomeSubdominio}`, prompt, html, id_projeto, imageURL, nomeSubdominio, 'ativo']
        );

        // pega o ID recém inserido
        const novoId = insertSite.rows[0].id;

        await client.query(
          `INSERT INTO site_prompts (user_id, id_projeto, prompt,id_site_gererate,status)
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, id_projeto, prompt, novoId, 'ativo']
        );

        // Envia ou atualiza HTML no subdomínio
        await enviarHTMLSubdominio(
          "ftp.sitexpres.com.br",
          process.env.user_directamin,
          process.env.pass_directamin,
          nomeSubdominio + '.sitexpres.com.br',
          html
        );

        jobs[jobId] = { status: "done", result: insertSite.rows[0], error: null };

      } catch (error) {
        console.error(error);
        jobs[jobId] = { status: "error", result: null, error: error.message };
      } finally {
        if (client) client.release();
      }
    })();

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Erro ao criar job" });
  }
};


// Rota para verificar status do job
export const jobStatus = (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];
  if (!job) return res.status(404).json({ success: false, message: "Job não encontrado" });
  res.json({ success: true, job });
};

export const getSites = async (req, res) => {

  let client;

  try {
    client = await pool.connect();
    /*  const result = await pool.query(
       "SELECT id, name, prompt, views, created_at FROM generated_sites WHERE user_id = $1 ORDER BY created_at DESC",
       [req.userId]
     ); */
    const result = await pool.query(
      `SELECT DISTINCT ON (id_projeto)
            id,
            name,
            prompt,
            views,
            created_at,
            html_content,
            subdominio,
            id_projeto
        FROM generated_sites
        WHERE user_id = $1
        AND status = $2
        ORDER BY id_projeto, created_at DESC`,
      [req.userId, 'ativo']
    );

    res.json({ success: true, sites: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Erro ao buscar sites" });
  }
};

export const getPromts = async (req, res) => {
  let client;

  try {
    client = await pool.connect();

    const { id_projeto } = req.params;

    const result = await pool.query(
      `SELECT id, id_projeto, prompt, created_at,id_site_gererate,status
       FROM public.site_prompts
       WHERE id_projeto = $1
       ORDER BY created_at DESC`,
      [id_projeto]
    );

    res.json({ success: true, prompts: result.rows });
  } catch (error) {
    console.error("Erro ao buscar prompts:", error);
    res.status(500).json({ success: false, message: "Erro ao buscar prompts" });
  } finally {
    if (client) client.release();
  }
};


//Check se id _projeto já existe
export const check_id_projeto = async (req, res) => {
  // 1. Obter o ID do projeto dos parâmetros da rota
  const { id_projeto } = req.params;
  let client;

  // 2. Consulta SQL eficiente: COUNT(*)
  const query = `
        SELECT COUNT(*) AS count
        FROM public.generated_sites
        WHERE id_projeto = $1;
    `;

  try {
    // 3. Obter uma conexão do pool
    client = await pool.connect();

    // 4. Executar a consulta, usando $1 para o id_projeto para prevenir SQL Injection
    const result = await client.query(query, [id_projeto]);

    // 5. Extrair e converter o resultado da contagem
    // O resultado da contagem é uma string/BIGINT no PostgreSQL, convertemos para número.
    const rowCount = parseInt(result.rows[0].count, 10);

    // 6. Implementar a lógica solicitada: retornar TRUE se a contagem for ZERO.
    const return_value = rowCount === 0;

    // 7. Enviar a resposta com status 200 (OK)
    // O valor enviado será true ou false.
    console.log(`Verificação de ID Projeto ${id_projeto}: Linhas encontradas: ${rowCount}. Retorno: ${return_value}`);
    res.status(200).json(return_value);

  } catch (err) {
    // 8. Logar o erro e enviar uma resposta de erro 500
    console.error("Erro no check_id_projeto:", err.message);
    res.status(500).json({
      error: "Erro interno do servidor ao verificar a existência do projeto.",
      details: err.message
    });
  } finally {
    // 9. Sempre liberar a conexão de volta ao pool
    if (client) {
      client.release();
    }
  }
};


export async function gerarNomeSubdominio(prompt) {
  try {
    const systemPrompt = `
      Você é um assistente que sugere nomes curtos, únicos e descritivos para projetos de sites.
      Retorne apenas uma palavra ou combinação curta sem espaços ou caracteres especiais,
      adequada para ser usada como subdomínio.
      Exemplo: "site de carro" → "sitecarro"
    `;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",        // modelo atualizado
      system: systemPrompt,     // <-- aqui é o system prompt
      messages: [
        { role: "user", content: `Prompt do projeto: ${prompt}\nNome do subdomínio:` }
      ],
      max_tokens: 1000,
    });

    // A resposta vem em response.content[0].text
    const nomeGerado = response.content?.[0]?.text || "";
    const nome = nomeGerado.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

    return nome.length > 15 ? nome.substring(0, 15) : nome;

  } catch (err) {
    console.error("Erro ao gerar nome do subdomínio via IA:", err);
    // fallback manual
    return prompt.toLowerCase().replace(/[^a-z0-9]/g, "").substring(0, 15);
  }
}


export const testecret_domin = async (req, res) => {
  try {
    const { subdominio } = req.body;

    if (!subdominio) {
      return res.status(400).json({ error: "Informe o subdomínio desejado." });
    }

    console.log("➡️ Criando subdomínio:", subdominio);

    // 1️⃣ Cria o subdomínio via DirectAdmin
    const respostaCriacao = await criarSubdominioDirectAdmin(subdominio, "sitexpres.com.br");
    console.log("✅ Subdomínio criado com resposta:", respostaCriacao);

    // 2️⃣ Gera o HTML temporário
    const htmlExemplo = `
      <!DOCTYPE html>
      <html lang="pt-br">
        <head>
          <meta charset="UTF-8">
          <title>Bem-vindo ao subdomínio ${subdominio}.sitexpres.com.br</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              background: linear-gradient(135deg, #6e8efb, #a777e3);
              color: #fff;
              text-align: center;
              padding-top: 100px;
            }
            h1 {
              font-size: 2.5em;
            }
            p {
              font-size: 1.2em;
            }
          </style>
        </head>
        <body>
          <h1>Subdomínio criado com sucesso!</h1>
          <p>Este é um exemplo de página HTML enviada automaticamente.</p>
          <p><b>Subdomínio:</b> ${subdominio}.sitexpres.com.br</p>
        </body>
      </html>
    `;

    console.log("📄 Gerando arquivo temporário HTML...");
    const tempPath = path.join("/tmp", `${subdominio}.html`);
    await fs.writeFile(tempPath, htmlExemplo);

    // 3️⃣ Envia o arquivo via FTP
    console.log("📤 Enviando HTML para o subdomínio via FTP...");

    const client = new ftp.Client();
    client.ftp.verbose = true;

    try {
      await client.access({
        host: "143.208.8.36",
        user: process.env.user_directamin,
        password: process.env.pass_directamin,
        port: 21,
      });

      const remotePath = `/domains/${subdominio}.sitexpres.com.br/public_html/index.html`;
      await client.ensureDir(`/domains/${subdominio}.sitexpres.com.br/public_html`);
      await client.uploadFrom(tempPath, remotePath);
      console.log("✅ HTML enviado com sucesso!");
    } catch (ftpError) {
      console.error("❌ Erro ao enviar HTML via FTP:", ftpError);
      throw ftpError;
    } finally {
      client.close();
      await fs.unlink(tempPath).catch(() => { });
    }

    // 4️⃣ Retorna sucesso
    res.json({
      success: true,
      message: `Subdomínio ${subdominio}.sitexpres.com.br criado e HTML enviado com sucesso!`,
    });
  } catch (error) {
    console.error("❌ Erro ao criar subdomínio de teste:", error);
    res.status(500).json({
      success: false,
      error: "Erro ao criar o subdomínio de teste.",
      detalhes: error.message,
    });
  }
};


export const list_don = async (req, res) => {
  try {
    const existe = await subdominioExiste("finalmengal", "sitexpres.com.br");

    console.log("----- RESULTADO -----");
    console.log(existe);
    console.log("---------------------");

    return res.status(200).json({ existe });
  } catch (err) {
    console.error("Erro ao listar domínios:", err.message);
    return res.status(500).json({ error: "Erro ao consultar subdomínio." });
  }
};


export const get_dominio = async (req, res) => {
  const { id_projeto } = req.params;
  let client;

  try {
    client = await pool.connect();

    const result = await client.query(
      "SELECT subdominio FROM generated_sites WHERE id_projeto = $1 LIMIT 1",
      [id_projeto]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Subdomínio não encontrado." });
    }

    const { subdominio } = result.rows[0];

    // Retorna também a URL completa, se quiser
    return res.json({
      subdominio,
      url: `https://${subdominio}.sitexpres.com.br`,
    });
  } catch (error) {
    console.error("Erro ao buscar subdomínio:", error);
    return res.status(500).json({ error: "Erro interno ao buscar subdomínio." });
  } finally {
    if (client) client.release(); // 🔥 importante para evitar vazamento de conexão
  }
};


export const restauracao_versao = async (req, res) => {
  try {
    const { id, id_projeto, id_site_gererate } = req.body;

    console.log("Dados recebidos:", { id, id_projeto, id_site_gererate });

    // Colocando todos os site_prompts como inativo
    await pool.query(
      `UPDATE public.site_prompts
       SET status = 'inativo'
       WHERE id_projeto = $1`,
      [id_projeto]
    );

    // Ativando 1 site_prompt específico pelo id
    await pool.query(
      `UPDATE public.site_prompts
       SET status = 'ativo'
       WHERE id = $1 AND id_projeto = $2`,
      [id, id_projeto]
    );

    // Colocando todos os generated_sites como inativo
    await pool.query(
      `UPDATE public.generated_sites
       SET status = 'inativo'
       WHERE id_projeto = $1`,
      [id_projeto]
    );

    // Ativando 1 generated_site específico pelo id
    await pool.query(
      `UPDATE public.generated_sites
       SET status = 'ativo'
       WHERE id = $1 AND id_projeto = $2`,
      [id_site_gererate, id_projeto]
    );

    //Consultado Site

    /*  const resultado = await pool.query(
          `SELECT * FROM public.sites
           WHERE id_projeto = $1 
           AND status = 'ativo'`,
          [id_projeto]
        );
        */

    //Consult html 
    const resultado = await pool.query(
      `SELECT html_content 
       FROM public.generated_sites
       WHERE id_projeto = $1 
       AND status = 'ativo'`,
      [id_projeto]
    );

    const html_new = resultado.rows[0]?.html_content || "<h5>Nenhum HTML encontrado</h5>";

    return res.json({
      success: true,
      message: "Versão restaurada com sucesso",
      html_new: html_new
    });

    return res.json({
      success: true,
      message: "Versão restaurada com sucesso",
      html_new: "<h5>o novo aqui</h5>"
    });

  } catch (error) {
    console.error("Erro ao restaurar versão:", error);

    return res.status(500).json({
      success: false,
      message: "Erro interno ao restaurar versão"
    });
  }
};