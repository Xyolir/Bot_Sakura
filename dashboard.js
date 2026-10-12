// ⚠️ À adapter : l'URL de ton API (le bot Node, voir api/server.js côté bot).
// En prod, mets l'URL réelle (ex: "https://api.tondomaine.fr").
const API_BASE = "http://localhost:3001";
// Client ID de l'application Discord du bot (le même que dans le lien "INVITER" de index.html)
const BOT_CLIENT_ID = "1460310869320663040";

const $ = (id) => document.getElementById(id);

const authGate = $("authGate");
const guildListView = $("guildListView");
const guildConfigView = $("guildConfigView");
const userBadge = $("userBadge");

let currentGuildId = null;
let currentGuildName = "";
let currentMemberCount = null;
let currentConfig = null;

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 401) {
    showView("auth");
    throw new Error("not_authenticated");
  }
  if (!res.ok) throw new Error(`Erreur API (${res.status})`);
  return res.status === 204 ? null : res.json();
}

function showView(view) {
  authGate.hidden = view !== "auth";
  guildListView.hidden = view !== "list";
  guildConfigView.hidden = view !== "config";
}

// ---------- Boot ----------
(async function init() {
  $("loginBtn").href = `${API_BASE}/api/auth/login`;

  try {
    const me = await api("/api/auth/me");
    userBadge.hidden = false;
    $("userName").textContent = me.username;
    $("userAvatar").src = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;
    await loadGuildList();
  } catch {
    showView("auth");
  }
})();

$("logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // API injoignable ou session déjà expirée : on recharge quand même
  }
  location.reload();
});

$("backBtn").addEventListener("click", () => {
  currentGuildId = null;
  showView("list");
});

// ---------- Liste des serveurs ----------
async function loadGuildList() {
  const guilds = await api("/api/guilds");
  const grid = $("guildGrid");
  grid.innerHTML = "";

  for (const g of guilds) {
    const card = document.createElement("div");
    card.className = "guild-card" + (g.botPresent ? "" : " disabled");

    const icon = document.createElement("img");
    icon.className = "guild-icon";
    icon.src = g.icon
      ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/0.png`;
    icon.alt = "";

    const info = document.createElement("div");
    info.className = "guild-info";
    const h4 = document.createElement("h4");
    h4.textContent = g.name;
    const p = document.createElement("p");
    p.textContent = g.botPresent
      ? `${g.memberCount ?? "?"} membres`
      : "Bot non présent";
    info.append(h4, p);

    if (!g.botPresent) {
      const invite = document.createElement("a");
      invite.className = "invite-link";
      invite.href = `https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${g.id}&disable_guild_select=true`;
      invite.textContent = "Inviter le bot →";
      invite.target = "_blank";
      info.appendChild(invite);
    } else {
      card.addEventListener("click", () =>
        openGuildConfig(g.id, g.name, g.memberCount).catch(showListError)
      );
    }

    card.append(icon, info);
    grid.appendChild(card);
  }

  showView("list");
}

// ---------- Configuration d'un serveur ----------
function showListError(err) {
  if (err && err.message === "not_authenticated") return; // la vue de connexion est déjà affichée
  const el = $("listError");
  el.textContent = "✕ Impossible de charger ce serveur. Vérifie que le bot tourne, puis réessaie.";
  el.hidden = false;
}

async function openGuildConfig(guildId, guildName, memberCount) {
  $("listError").hidden = true;
  currentGuildId = guildId;
  currentGuildName = guildName;
  currentMemberCount = memberCount;
  $("cfgGuildName").textContent = guildName;
  $("cfgGuildTag").textContent = "SERVEUR SÉLECTIONNÉ";

  const [details, config] = await Promise.all([
    api(`/api/guilds/${guildId}`),
    api(`/api/guilds/${guildId}/config`),
  ]);
  currentConfig = config;

  fillSelect($("verifiedRoleId"), details.roles, config.verifiedRoleId, "Aucun", "@");
  fillSelect($("staffRoleId"), details.roles, config.staffRoleId, "Aucun", "@");
  fillSelect($("logChannelId"), details.channels, config.logChannelId, "Aucun", "#");
  fillSelect($("ticketCategoryId"), details.categories, config.ticketCategoryId, "Aucune", "");
  fillSelect($("welcomeChannelId"), details.channels, null, "Aucun", "#");
  fillSelect($("reglementChannelId"), details.channels, null, "Aucun", "#");

  $("spamLimit").value = config.spamLimit;
  $("spamWindowSec").value = Math.round(config.spamWindowMs / 1000);

  renderBadWords(config.badWords || []);
  setSaveStatus("");

  await Promise.all([loadMessageEditor("welcome"), loadMessageEditor("reglement")]);

  showView("config");
}

function fillSelect(select, items, selectedId, emptyLabel, prefix) {
  select.innerHTML = "";
  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = `— ${emptyLabel} —`;
  select.appendChild(emptyOpt);

  for (const item of items) {
    const opt = document.createElement("option");
    opt.value = item.id;
    opt.textContent = `${prefix}${item.name}`;
    if (item.id === selectedId) opt.selected = true;
    select.appendChild(opt);
  }
}

// ---------- Mots filtrés (chips) ----------
let badWords = [];

function renderBadWords(words) {
  badWords = [...words];
  const list = $("badWordsList");
  list.innerHTML = "";
  for (const word of badWords) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = word;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.addEventListener("click", () => {
      badWords = badWords.filter((w) => w !== word);
      renderBadWords(badWords);
    });
    chip.appendChild(btn);
    list.appendChild(chip);
  }
}

$("addBadWordBtn").addEventListener("click", addBadWordFromInput);
$("badWordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addBadWordFromInput();
  }
});

function addBadWordFromInput() {
  const input = $("badWordInput");
  const word = input.value.trim().toLowerCase();
  if (word && !badWords.includes(word)) {
    badWords.push(word);
    renderBadWords(badWords);
  }
  input.value = "";
}

// ---------- Sauvegarde ----------
$("saveBtn").addEventListener("click", async () => {
  if (!currentGuildId) return;

  const payload = {
    verifiedRoleId: $("verifiedRoleId").value || null,
    staffRoleId: $("staffRoleId").value || null,
    logChannelId: $("logChannelId").value || null,
    ticketCategoryId: $("ticketCategoryId").value || null,
    spamLimit: Number($("spamLimit").value) || 5,
    spamWindowMs: (Number($("spamWindowSec").value) || 7) * 1000,
    badWords,
  };

  setSaveStatus("Enregistrement...", "");
  try {
    currentConfig = await api(`/api/guilds/${currentGuildId}/config`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setSaveStatus("✓ Configuration enregistrée", "success");
  } catch (err) {
    setSaveStatus("✕ Échec de l'enregistrement", "error");
  }
});

function setSaveStatus(text, kind = "") {
  const el = $("saveStatus");
  el.textContent = text;
  el.className = "save-status" + (kind ? ` ${kind}` : "");
}

// ---------- Éditeurs d'embeds (Bienvenue / Règlement) ----------

// key = "welcome" ou "reglement" — les IDs du DOM sont préfixés en conséquence
async function loadMessageEditor(key) {
  const msg = await api(`/api/guilds/${currentGuildId}/messages/${key}`);

  if (key === "welcome") $("welcomeEnabled").checked = Boolean(msg.enabled);
  $(`${key}ChannelId`).value = msg.channelId || "";
  $(`${key}Title`).value = msg.embed.title || "";
  $(`${key}Description`).value = msg.embed.description || "";
  $(`${key}Color`).value = msg.embed.color || "#5865f2";
  $(`${key}ImageUrl`).value = msg.embed.imageUrl || "";
  $(`${key}ThumbnailUrl`).value = msg.embed.thumbnailUrl || "";
  $(`${key}Footer`).value = msg.embed.footer || "";
  if (key === "reglement") $("reglementButtonLabel").value = msg.buttonLabel || "J'accepte le règlement";

  updateEmbedPreview(key);
}

function currentEmbedFromForm(key) {
  return {
    title: $(`${key}Title`).value,
    description: $(`${key}Description`).value,
    color: $(`${key}Color`).value,
    imageUrl: $(`${key}ImageUrl`).value,
    thumbnailUrl: $(`${key}ThumbnailUrl`).value,
    footer: $(`${key}Footer`).value,
  };
}

// Remplace les variables comme le fait le bot, avec des valeurs d'exemple
function previewVars(text) {
  return (text || "")
    .replaceAll("{user}", "@Utilisateur")
    .replaceAll("{username}", "Utilisateur")
    .replaceAll("{server}", currentGuildName || "Serveur")
    .replaceAll("{memberCount}", String(currentMemberCount ?? 42));
}

// Affiche le texte avec **gras** — sans innerHTML, le contenu vient d'un champ libre
function setDiscordText(el, text) {
  el.textContent = "";
  previewVars(text).split("**").forEach((part, i) => {
    if (!part) return;
    if (i % 2 === 1) {
      const b = document.createElement("strong");
      b.textContent = part;
      el.appendChild(b);
    } else {
      el.appendChild(document.createTextNode(part));
    }
  });
}

function updateEmbedPreview(key) {
  const embed = currentEmbedFromForm(key);

  $(`${key}PreviewBar`).style.background = embed.color || "#5865f2";
  $(`${key}PreviewTitle`).textContent = previewVars(embed.title);
  $(`${key}PreviewTitle`).hidden = !embed.title;
  setDiscordText($(`${key}PreviewDesc`), embed.description);
  $(`${key}PreviewFooter`).textContent = previewVars(embed.footer);
  $(`${key}PreviewFooter`).hidden = !embed.footer;

  const img = $(`${key}PreviewImage`);
  if (embed.imageUrl) { img.src = embed.imageUrl; img.hidden = false; } else { img.hidden = true; }

  const thumb = $(`${key}PreviewThumb`);
  if (embed.thumbnailUrl) { thumb.src = embed.thumbnailUrl; thumb.hidden = false; } else { thumb.hidden = true; }
}

for (const key of ["welcome", "reglement"]) {
  for (const field of ["Title", "Description", "Color", "ImageUrl", "ThumbnailUrl", "Footer"]) {
    $(`${key}${field}`).addEventListener("input", () => updateEmbedPreview(key));
  }
}

$("reglementButtonLabel").addEventListener("input", () => {
  $("reglementPreviewBtn").textContent = `✅ ${$("reglementButtonLabel").value || "J'accepte"}`;
});

async function saveMessageEditor(key) {
  const statusEl = $(`${key}Status`);
  const setStatus = (text, kind = "") => {
    statusEl.textContent = text;
    statusEl.className = "save-status" + (kind ? ` ${kind}` : "");
  };

  const payload = {
    channelId: $(`${key}ChannelId`).value || null,
    embed: currentEmbedFromForm(key),
  };
  if (key === "welcome") payload.enabled = $("welcomeEnabled").checked;
  if (key === "reglement") payload.buttonLabel = $("reglementButtonLabel").value;

  setStatus("Enregistrement...");
  try {
    await api(`/api/guilds/${currentGuildId}/messages/${key}`, { method: "PUT", body: JSON.stringify(payload) });
    setStatus("✓ Enregistré", "success");
  } catch {
    setStatus("✕ Échec de l'enregistrement", "error");
  }
}

async function publishMessageEditor(key) {
  const statusEl = $(`${key}Status`);
  const setStatus = (text, kind = "") => {
    statusEl.textContent = text;
    statusEl.className = "save-status" + (kind ? ` ${kind}` : "");
  };

  if (!$(`${key}ChannelId`).value) {
    setStatus("✕ Choisis un salon d'abord", "error");
    return;
  }

  await saveMessageEditor(key); // on enregistre toujours avant de publier
  setStatus("Publication...");
  try {
    await api(`/api/guilds/${currentGuildId}/messages/${key}/publish`, { method: "POST", body: JSON.stringify({}) });
    setStatus("✓ Publié sur Discord", "success");
  } catch {
    setStatus("✕ Échec de la publication", "error");
  }
}

$("welcomeSaveBtn").addEventListener("click", () => saveMessageEditor("welcome"));
$("welcomePublishBtn").addEventListener("click", () => publishMessageEditor("welcome"));
$("reglementSaveBtn").addEventListener("click", () => saveMessageEditor("reglement"));
$("reglementPublishBtn").addEventListener("click", () => publishMessageEditor("reglement"));
