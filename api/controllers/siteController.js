import pool from "../config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const USE_GEMINI = false;

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

export async function gerarParte(prompt, parte, req, id_projeto) {
  try {
    let systemPrompt = `
Você é um designer e desenvolvedor profissional de sites modernos.
Crie um site completo baseado na descrição: "${prompt}".
Use HTML5, CSS3 moderno e JavaScript funcional.
Inclua imagens reais ou placeholders de alta qualidade relacionadas ao tema.
O site deve ser responsivo e em português.
⚠️ Responda apenas com código HTML puro, sem markdown nem explicações.
    `;

    let text = "";

    if (USE_GEMINI) {
      // 🧠 Gemini 2.5 PRO
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      const result = await model.generateContent(systemPrompt);
      text = result.response.text();
    } else {
      // 🤖 Claude
      const message = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 20000,
        messages: [{ role: "user", content: systemPrompt }],
      });
      text = message.content[0].type === "text" ? message.content[0].text : "";
    }

    return limparRetorno(text); // ✅ já limpa possíveis ```html
  } catch (error) {
    console.error("Erro ao gerar parte do site:", error);
    return "<!-- Erro ao gerar conteúdo -->";
  }
}



// Limpeza de markdown ou tags extras
/* function limparRetorno(codigo, parte) {
  codigo = codigo.replace(/```(?:html|css|js)?\n?/gi, "");
  codigo = codigo.replace(/```/g, "");
  if (parte === "CSS" || parte === "JS") {
    codigo = codigo.replace(/<[^>]+>/g, "");
  }
  return codigo.trim();
} */

// Função principal combinada
// Jobs temporários em memória
export const jobs = {}; // { jobId: { status, result, error } }

export const newsite = async (req, res) => {
  try {
    const { prompt, id_projeto } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, message: "Prompt não enviado" });
    }

    const jobId = uuidv4();
    jobs[jobId] = { status: "processing", result: null, error: null };
    res.json({ success: true, jobId });

    (async () => {
      let client;
      try {
        client = await pool.connect();

        // ✅ Verifica se já existe id_projeto
        const existing = await client.query(
          `SELECT html_content FROM generated_sites 
           WHERE id_projeto = $1 
           ORDER BY created_at DESC LIMIT 1`,
          [id_projeto]
        );

        let baseHTML = existing.rows.length > 0 ? existing.rows[0].html_content : "";

        // ✅ Se tiver baseHTML, podemos enviar para Claude/Gemini junto com o prompt para alterações
        const fullPrompt = baseHTML
          ? `Aqui está o HTML existente:\n${baseHTML}\nFaça as alterações solicitadas: ${prompt}`
          : prompt;

        // ✅ Gera HTML (Claude/Gemini)
        const html = await gerarParte(fullPrompt, "HTML", req, id_projeto);
        const css = ''; // opcional, se for gerar CSS
        const js = '';  // opcional, se for gerar JS

        // ✅ Salva a nova versão no generated_sites
        const insertSite = await client.query(
          `INSERT INTO generated_sites 
           (user_id, name, prompt, html_content, css_content, js_content, id_projeto)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name, prompt, html_content, css_content, js_content, created_at`,
          [req.userId, `Site de ${prompt}`, prompt, html, css, js, id_projeto]
        );

        // ✅ Salva o prompt na tabela site_prompts
        await client.query(
          `INSERT INTO site_prompts (user_id, id_projeto, prompt)
           VALUES ($1, $2, $3)`,
          [req.userId, id_projeto, prompt]
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
  try {
    const result = await pool.query(
      "SELECT id, name, prompt, views, created_at FROM generated_sites WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json({ success: true, sites: result.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Erro ao buscar sites" });
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