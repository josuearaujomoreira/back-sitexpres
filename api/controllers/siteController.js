import pool from "../config/db.js";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 20000;

// Função para gerar cada parte do site
async function gerarParte(prompt, parte) {
  const systemPrompt = `
      Você é um designer e desenvolvedor profissional de sites modernos.
      completo do site: ${prompt}.
      Use HTML5, CSS3 moderno e JS funcional.
      Inclua imagens reais ou placeholders de alta qualidade.
      O site deve ser responsivo e em português.
      se prescisar inclua imagens reais que correspondam exatamente ao tema do site. 
      Se usar placeholder, a palavra-chave deve corresponder ao tema. 
      Nunca use imagens fora do contexto..
      Responda apenas com código puro, sem markdown ou explicações.
      `;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: systemPrompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "";
  return text.trim();
}

// Limpeza de markdown ou tags extras
function limparRetorno(codigo, parte) {
  codigo = codigo.replace(/```(?:html|css|js)?\n?/gi, "");
  codigo = codigo.replace(/```/g, "");
  if (parte === "CSS" || parte === "JS") {
    codigo = codigo.replace(/<[^>]+>/g, "");
  }
  return codigo.trim();
}

// Função principal combinada
// Jobs temporários em memória
export const jobs = {}; // { jobId: { status, result, error } }

export const newsite = async (req, res) => {
  try {
    const { prompt, id_projeto } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({ success: false, message: "Prompt não enviado" });
    }

    // Cria jobId e status inicial
    const jobId = uuidv4();
    jobs[jobId] = { status: "processing", result: null, error: null };

    // Responde imediatamente para o frontend
    res.json({ success: true, jobId });

    // Processa em background
    (async () => {
      try {
        const html = limparRetorno(await gerarParte(prompt, "HTML"), "HTML");
        const css = '' //limparRetorno(await gerarParte(prompt, "CSS"), "CSS");
        const js = ''// limparRetorno(await gerarParte(prompt, "JS"), "JS");

        // Salva no banco
        const insert = await pool.query(
          `INSERT INTO generated_sites 
           (user_id, name, prompt, html_content, css_content, js_content,id_projeto)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, name, prompt, html_content, css_content, js_content, created_at`,
          [req.userId, `Site de ${prompt}`, 'siteTitle', html, css, js, id_projeto]
        );

        const site = insert.rows[0];

        // Salva o prompt em tabela separada
        await pool.query(
          `INSERT INTO site_prompts (user_id, id_projeto, prompt)
       VALUES ($1, $2, $3)`,
          [req.userId, id_projeto, prompt]
        );


        jobs[jobId] = { status: "done", result: insert.rows[0], error: null };
      } catch (error) {
        console.error(error);
        jobs[jobId] = { status: "error", result: null, error: error.message };
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