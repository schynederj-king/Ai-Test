const form = document.querySelector("#chat-form");
const input = document.querySelector("#message");
const send = document.querySelector("#send");
const messages = document.querySelector("#messages");
const welcome = document.querySelector("#welcome");
const statusEl = document.querySelector("#status");
const clearBtn = document.querySelector("#clear");
let history = [];

async function updateStatus() {
  try {
    const r = await fetch("/api/status");
    const s = await r.json();
    if (s.geminiReady && s.openaiReady) {
      statusEl.textContent = "● Both connected";
      statusEl.className = "status ready";
    } else {
      statusEl.textContent = "● Setup needed";
      statusEl.className = "status warn";
    }
  } catch {
    statusEl.textContent = "● Server offline";
    statusEl.className = "status warn";
  }
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function addTurn(user, gemini, chatgpt, error = "") {
  welcome.hidden = true;
  const el = document.createElement("article");
  el.className = "turn";
  el.innerHTML = `<div class="user-bubble">${esc(user)}</div>` +
    (error ? `<div class="error">${esc(error)}</div>` : "") +
    ((gemini || chatgpt) ? `<div class="ai-grid">
      <section class="ai-card gemini"><div class="ai-head"><span class="ai-dot">G</span> Gemini</div><div class="ai-text">${esc(gemini || "No response yet.")}</div></section>
      <section class="ai-card chatgpt"><div class="ai-head"><span class="ai-dot">✦</span> ChatGPT</div><div class="ai-text">${esc(chatgpt || "No response yet.")}</div></section>
    </div>` : "");
  messages.appendChild(el);
  el.scrollIntoView({behavior:"smooth", block:"end"});
}
form.addEventListener("submit", async e => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message || send.disabled) return;
  input.value = "";
  send.disabled = true;
  send.querySelector("span").textContent = "Thinking…";
  welcome.hidden = true;
  const loading = document.createElement("div");
  loading.className = "loading";
  loading.textContent = "Gemini is responding, then ChatGPT will join…";
  messages.appendChild(loading);
  try {
    const response = await fetch("/api/chat", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({message, history})
    });
    const data = await response.json();
    loading.remove();
    if (!response.ok) {
      addTurn(message, data.gemini || "", "", data.error || "Something went wrong.");
    } else {
      addTurn(message, data.gemini, data.chatgpt);
      history.push({role:"user", content:message});
      history.push({role:"assistant", content:`Gemini: ${data.gemini}\nChatGPT: ${data.chatgpt}`});
      history = history.slice(-12);
    }
  } catch (err) {
    loading.remove();
    addTurn(message, "", "", `Could not reach the server. Is it running? ${err.message}`);
  } finally {
    send.disabled = false;
    send.querySelector("span").textContent = "Send to both";
    input.focus();
  }
});
clearBtn.addEventListener("click", () => {
  history = [];
  messages.innerHTML = "";
  welcome.hidden = false;
  input.focus();
});
updateStatus();