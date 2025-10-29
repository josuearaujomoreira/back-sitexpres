import pool from "../config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";
import { v4 as uuidv4 } from "uuid";
import { criarContaDirectAdmin, enviarHTMLFTP } from "./integracao_directadmin.js";

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

export async function gerarParte(prompt, parte, req, id_projeto) {
  try {
    const systemPrompt = `
Você é um designer e desenvolvedor profissional de sites modernos.
Crie um site completo baseado na descrição: "${prompt}".
Use HTML5, CSS3 moderno e JavaScript funcional.
O site deve ser responsivo e em português.

***Instruções Cruciais para Imagens e Conteúdo:***
1. **Imagens:** Inclua placeholders de alta qualidade relacionados ao tema. Para garantir relevância, use serviços de placeholder que permitem temas (ex: source.unsplash.com/random/800x600?car,sport ou via.placeholder.com/800x600?text=Nome+do+Item).
2. **ALT:** O texto ALT de todas as imagens deve ser sempre **muito descritivo** do que a imagem representa para evitar confusão se a imagem falhar.
3. **Rodapé:** O ano no rodapé (copyright) deve ser **o ano atual**.

⚠️ Responda apenas com código HTML puro, sem markdown nem explicações.
`;

    let html = "";

    if (USE_GEMINI) {
      // 🧠 Gemini 2.5 PRO
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });
      const result = await model.generateContent(systemPrompt);
      html = result.response.text();
      return limparRetorno(html);
    } else {
      // ✅ Claude com Messages API moderna (streaming)
      const stream = await anthropic.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 22000,
        system: "Você é um assistente especialista em criação de sites modernos e responsivos. Sempre gere código HTML, CSS e JS puro.",
        messages: [
          {
            role: "user",
            content: systemPrompt,
          },
        ],
      });

      // ✅ Recebe os chunks do stream corretamente
      for await (const event of stream) {
        console.log("EVENT:", event.type, event.delta?.text?.slice(0, 50)); // mostra início do chunk
        if (event.type === "content_block_delta" && event.delta?.text) {
          html += event.delta.text;
          console.log("📥 Chunk adicionado, tamanho atual do HTML:", html.length);
        }
      }

      console.log('11----------22')
      console.log(html)
      console.log('33----------44')

      return limparRetorno(html);
    }


  } catch (error) {
    console.error("Erro ao gerar parte do site:", error);

    // ✅ Logs mais claros pra debug
    if (error?.error?.message) console.error("Mensagem do modelo:", error.error.message);
    if (error?.requestID) console.error("ID da requisição:", error.requestID);

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
    const imageFile = req.file ? `/uploads/images/${req.file.filename}` : null;

    // URL base padrão
    const baseURL = "https://back.sitexpres.com.br/uploads/logos/";

    // URL completa da imagem
    const imageURL = req.file ? `${baseURL}${req.file.filename}` : null;

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

        const existing = await client.query(
          `SELECT html_content FROM generated_sites 
           WHERE id_projeto = $1 
           ORDER BY created_at DESC LIMIT 1`,
          [id_projeto]
        );

        let baseHTML = existing.rows.length > 0 ? existing.rows[0].html_content : "";

        // Se houver imagem, passa a URL no prompt para a IA
        const fullPrompt = imageURL
          ? `${prompt}\nUse esta url da imagem no site: ${imageURL}`
          : prompt;

        const finalPrompt = baseHTML
          ? `HTML atual:\n${baseHTML}\nFaça as alterações solicitadas: ${fullPrompt}`
          : fullPrompt;

        const html = await gerarParte(finalPrompt, "HTML", req, id_projeto);
        const primeiraVez = existing.rows.length === 0;

        const insertSite = await client.query(
          `INSERT INTO generated_sites 
           (user_id, name, prompt, html_content, id_projeto, image_path)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, name, prompt, html_content, created_at`,
          [req.userId, `Site de ${prompt}`, prompt, html, id_projeto, imageURL]
        );

        await client.query(
          `INSERT INTO site_prompts (user_id, id_projeto, prompt)
           VALUES ($1, $2, $3)`,
          [req.userId, id_projeto, prompt]
        );
        
        if (primeiraVez) {
          await criarContaDirectAdmin(`user${id_projeto}`, "Senha123!", `site${id_projeto}.seudominio.com`);
        }

        await enviarHTMLFTP("ftp.seudominio.com", `user${id_projeto}`, "Senha123!", html);


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