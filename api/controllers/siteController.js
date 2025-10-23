import pool from "../config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const USE_GEMINI = true;

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 20000;

// Função para gerar cada parte do site
export async function gerarParte(prompt, parte, req, id_projeto) {
  try {
    let systemPrompt = `
Você é um designer e desenvolvedor profissional de sites modernos.
Crie um site completo baseado na descrição: "${prompt}".
Use HTML5, CSS3 moderno e JavaScript funcional.
Inclua imagens reais ou placeholders de alta qualidade relacionadas ao tema.
O site deve ser responsivo e em português.
Responda apenas com código HTML puro, sem markdown nem explicações.
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
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8000,
        messages: [{ role: "user", content: systemPrompt }],
      });
      text = message.content[0].type === "text" ? message.content[0].text : "";
    }

    return text.trim();
  } catch (error) {
    console.error("Erro ao gerar parte do site:", error);
    return "<!-- Erro ao gerar conteúdo -->";
  }
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

    const jobId = uuidv4();
    jobs[jobId] = { status: "processing", result: null, error: null };
    res.json({ success: true, jobId });

    (async () => {
      try {
        const site = await gerarParte(prompt, "HTML", req, id_projeto);
        jobs[jobId] = { status: "done", result: site, error: null };
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