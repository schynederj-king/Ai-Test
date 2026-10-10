import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-6-astra";

app.get("/api/status", (_req, res) => {
  res.json({
    geminiReady: Boolean(process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes("put_your")),
    openaiReady: Boolean(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes("put_your")),
    geminiModel: GEMINI_MODEL,
    openaiModel: OPENAI_MODEL
  });
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-12) : [];
  if (!message) return res.status(400).json({ error: "Type a message first." });
  if (!process.env.GEMINI_API_KEY || !process.env.OPENAI_API_KEY) {
    return res.status(400).json({
      error: "Add both API keys to your .env file, then restart the website. The keys are kept on the server."
    });
  }

  const conversation = history.map(m => `${m.role === "assistant" ? "Assistant" : "User"}: ${String(m.content || "").slice(0, 3000)}`).join("\n");
  const geminiPrompt = [
    "You are Gemini participating in a friendly shared conversation with another AI assistant.",
    "Respond to the user's latest message naturally. Keep the response useful and reasonably concise.",
    conversation ? `Earlier conversation:\n${conversation}` : "",
    `User's latest message:\n${message}`
  ].filter(Boolean).join("\n\n");

  try {
    const gResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: geminiPrompt }] }] })
    });
    const gData = await gResponse.json();
    if (!gResponse.ok) {
      return res.status(gResponse.status).json({ error: `Gemini API error: ${gData?.error?.message || gResponse.statusText}` });
    }
    const geminiText = (gData.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("\n").trim();
    if (!geminiText) return res.status(502).json({ error: "Gemini returned an empty response. Check the model name and API access." });

    const openaiInput = [
      {
        role: "system",
        content: "You are ChatGPT participating in a shared conversation with Gemini. You can build on Gemini's reply, respectfully disagree, or add a different perspective. Speak directly to the user, not as if you are Gemini. Keep it natural and concise."
      },
      ...(history.slice(-12).map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 3000)
      }))),
      {
        role: "user",
        content: `User's latest message: ${message}\n\nGemini's response:\n${geminiText}\n\nNow give your own response to the user, taking Gemini's answer into account.`
      }
    ];

    const oResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({ model: OPENAI_MODEL, input: openaiInput })
    });
    const oData = await oResponse.json();
    if (!oResponse.ok) {
      return res.status(oResponse.status).json({ error: `OpenAI API error: ${oData?.error?.message || oResponse.statusText}`, gemini: geminiText });
    }
    const openaiText = oData.output_text || (oData.output || []).flatMap(item => item.content || []).map(part => part.text || "").join("\n").trim();
    res.json({ gemini: geminiText, chatgpt: openaiText || "ChatGPT returned an empty response." });
  } catch (err) {
    res.status(500).json({ error: `Connection error: ${err.message}` });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Gemini + ChatGPT Bridge running at http://localhost:${port}`));