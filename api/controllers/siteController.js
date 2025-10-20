import pool from "../config/db.js";
import Anthropic from "@anthropic-ai/sdk";


const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 20000;

// Função para gerar cada parte do site
async function gerarParte(prompt, parte) {
  const systemPrompt = `
Você é um designer e desenvolvedor profissional de sites modernos.
Gere SOMENTE o ${parte} completo do site: ${prompt}.
Use HTML5, CSS3 moderno e JS funcional.
Inclua imagens reais ou placeholders de alta qualidade.
O site deve ser responsivo e em português.
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
export const newsite = async (req, res) => {
  try {
    const { prompt } = req.body;

    // 1️⃣ Se vier prompt, gera novo site
    let novoSite = null;
    if (prompt) {
      const html = limparRetorno(await gerarParte(prompt, "HTML"), "HTML");
      const css = limparRetorno(await gerarParte(prompt, "CSS"), "CSS");
      const js = limparRetorno(await gerarParte(prompt, "JS"), "JS");

      // Salva no banco
      const insert = await pool.query(
        `INSERT INTO generated_sites (user_id, name, prompt, html, css, js)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, prompt, created_at`,
        [req.userId, `Site de ${prompt}`, prompt, html, css, js]
      );
      novoSite = insert.rows[0];
    }

    // 2️⃣ Busca todos os sites existentes do usuário
    const result = await pool.query(
      "SELECT id, name, prompt, views, created_at FROM generated_sites WHERE user_id = $1 ORDER BY created_at DESC",
      [req.userId]
    );

    res.json({ success: true, sites: result.rows, newSite: novoSite });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Erro ao gerar/buscar sites" });
  }
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