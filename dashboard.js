// Noyau du dashboard : API, vues, onglets, onglet « Général ».
// Les autres fichiers (dashboard-embeds.js, dashboard-roles.js, dashboard-automod.js) s'enregistrent via P0Dashboard.modules.
(function () {
  // Valeurs de secours si site-config.js n'a pas été copié à côté de dashboard.html
  const { API_BASE, BOT_CLIENT_ID } = window.P0_CONFIG || { API_BASE: "http://localhost:3001", BOT_CLIENT_ID: "1460310869320663040" };
  const $ = (id) => document.getElementById(id);

  const P0 = (window.P0Dashboard = {
    $,
    modules: [],           // { load(details, config) } appelé à l'ouverture d'un serveur
    state: { guildId: null, guildName: "", memberCount: null, details: null, config: null },
  });

  // ---------- Messages d'erreur lisibles ----------
  const ROLE_REASONS = {
    not_found: "ce rôle n'existe plus",
    everyone: "@everyone ne peut pas être attribué",
    managed: "rôle géré par une intégration",
    sensitive: "ce rôle a des permissions sensibles (admin, modération, gestion…)",
    bot_missing_permission: "le bot n'a pas la permission « Gérer les rôles »",
    bot_hierarchy: "ce rôle est au-dessus (ou au niveau) du rôle du bot : monte le rôle du bot dans la liste",
    user_hierarchy: "ce rôle est au-dessus (ou au niveau) de ton rôle le plus élevé",
  };

  const ERROR_TEXT = {
    network: "API injoignable : vérifie que le bot tourne.",
    invalid_channel: "Salon invalide (le bot doit pouvoir y écrire).",
    bot_cannot_post: "Le bot n'a pas la permission d'écrire dans ce salon.",
    no_channel_configured: "Choisis d'abord un salon.",
    empty_embed: "Le message est vide : ajoute un titre, une description ou une image.",
    missing_manage_roles_permission: "Il te faut la permission « Gérer les rôles » pour ça.",
    missing_manage_guild_permission: "Il te faut la permission « Gérer le serveur ».",
    not_a_member: "Tu n'es pas membre de ce serveur.",
    bot_not_in_guild: "Le bot n'est plus sur ce serveur.",
    too_many_panels: "Trop de panneaux (10 maximum).",
    too_many_roles: "Trop de rôles dans un panneau (10 maximum).",
    no_roles: "Ajoute au moins un rôle au panneau.",
    unknown_panel: "Ce panneau n'existe plus : recharge la page.",
    invalid_category: "Catégorie invalide.",
    invalid_role: "Rôle invalide.",
    invalid_value: "Valeur invalide.",
    invalid_json: "Requête invalide.",
  };

  const WARNING_TEXT = {
    no_verified_role: "pense à choisir le rôle « après validation » (onglet Général), sinon le bouton ne donnera rien",
    no_ticket_category: "choisis une catégorie de tickets (onglet Général)",
    no_staff_role: "choisis un rôle staff (onglet Général) pour qu'il voie les tickets",
  };

  P0.errorText = function (err, fallback) {
    if (!err) return fallback;
    if (err.code === "role_not_assignable") {
      const role = P0.state.details?.roles.find((r) => r.id === err.data?.roleId);
      const why = ROLE_REASONS[err.data?.reason] || "ce rôle ne peut pas être attribué";
      return `Rôle refusé${role ? ` (@${role.name})` : ""} : ${why}.`;
    }
    return ERROR_TEXT[err.code] || fallback;
  };
  P0.warningText = (list) => (list || []).map((w) => WARNING_TEXT[w]).filter(Boolean).join(" · ");
  P0.roleReason = (reason) => ROLE_REASONS[reason] || "ce rôle ne peut pas être attribué";

  // ---------- API ----------
  P0.api = async function (path, options = {}) {
    let res;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        ...options,
      });
    } catch {
      throw Object.assign(new Error("network"), { code: "network" });
    }
    if (res.status === 401) {
      showView("auth");
      throw Object.assign(new Error("not_authenticated"), { code: "not_authenticated" });
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw Object.assign(new Error(data.error || `http_${res.status}`), { code: data.error, data, status: res.status });
    }
    return res.status === 204 ? null : res.json();
  };

  P0.setStatus = function (el, text, kind = "") {
    el.textContent = text;
    el.className = "save-status" + (kind ? ` ${kind}` : "");
  };

  // ---------- Aides DOM ----------
  P0.h = function (tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === false || v === null || v === undefined) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) if (c) el.append(c);
    return el;
  };

  // items : [{ id, name, assignable? }] — si assignable === false, l'option est grisée avec la raison
  P0.fillSelect = function (select, items, selectedId, emptyLabel, prefix = "") {
    select.innerHTML = "";
    select.append(P0.h("option", { value: "", text: `— ${emptyLabel} —` }));
    for (const item of items) {
      const blocked = item.assignable === false && item.id !== selectedId;
      const opt = P0.h("option", { value: item.id, text: `${prefix}${item.name}` });
      if (blocked) {
        opt.disabled = true;
        opt.textContent += " (indisponible)";
      }
      if (item.id === selectedId) opt.selected = true;
      select.append(opt);
    }
  };

  // Texte « Discord » : variables d'exemple + **gras**, sans innerHTML (le contenu vient d'un champ libre)
  P0.previewVars = (text) =>
    (text || "")
      .replaceAll("{user}", "@Utilisateur")
      .replaceAll("{username}", "Utilisateur")
      .replaceAll("{server}", P0.state.guildName || "Serveur")
      .replaceAll("{memberCount}", String(P0.state.memberCount ?? 42));

  P0.setDiscordText = function (el, text) {
    el.textContent = "";
    P0.previewVars(text).split("**").forEach((part, i) => {
      if (!part) return;
      if (i % 2 === 1) el.append(P0.h("strong", { text: part }));
      else el.append(document.createTextNode(part));
    });
  };

  // ---------- Vues ----------
  const authGate = $("authGate");
  const guildListView = $("guildListView");
  const guildConfigView = $("guildConfigView");

  function showView(view) {
    authGate.hidden = view !== "auth";
    guildListView.hidden = view !== "list";
    guildConfigView.hidden = view !== "config";
  }

  function showTab(name) {
    for (const tab of document.querySelectorAll("#tabBar .tab")) {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    }
    for (const pane of document.querySelectorAll(".tab-pane")) pane.hidden = pane.id !== `tab-${name}`;
  }

  $("tabBar").addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (tab) showTab(tab.dataset.tab);
  });

  $("backBtn").addEventListener("click", () => {
    P0.state.guildId = null;
    showView("list");
  });

  $("logoutBtn").addEventListener("click", async () => {
    try {
      await P0.api("/api/auth/logout", { method: "POST" });
    } catch {
      // API injoignable ou session déjà expirée : on recharge quand même
    }
    location.reload();
  });

  // ---------- Liste des serveurs ----------
  function showListError(err) {
    if (err && err.code === "not_authenticated") return; // la vue de connexion est déjà affichée
    const el = $("listError");
    el.textContent = `✕ ${P0.errorText(err, "Impossible de charger ce serveur.")}`;
    el.hidden = false;
  }

  async function loadGuildList() {
    const guilds = await P0.api("/api/guilds");
    const grid = $("guildGrid");
    grid.innerHTML = "";

    for (const g of guilds) {
      const icon = P0.h("img", {
        class: "guild-icon",
        alt: "",
        src: g.icon
          ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64`
          : "https://cdn.discordapp.com/embed/avatars/0.png",
      });
      const info = P0.h("div", { class: "guild-info" },
        P0.h("h4", { text: g.name }),
        P0.h("p", { text: g.botPresent ? `${g.memberCount ?? "?"} membres` : "Bot non présent" })
      );
      const card = P0.h("div", { class: "guild-card" + (g.botPresent ? "" : " disabled") }, icon, info);

      if (!g.botPresent) {
        info.append(P0.h("a", {
          class: "invite-link",
          target: "_blank",
          rel: "noopener",
          text: "Inviter le bot →",
          href: `https://discord.com/oauth2/authorize?client_id=${BOT_CLIENT_ID}&permissions=8&scope=bot%20applications.commands&guild_id=${g.id}&disable_guild_select=true`,
        }));
      } else {
        card.addEventListener("click", () => openGuildConfig(g).catch(showListError));
      }
      grid.append(card);
    }
    showView("list");
  }

  // ---------- Ouverture d'un serveur ----------
  async function openGuildConfig(g) {
    $("listError").hidden = true;
    const s = P0.state;
    s.guildId = g.id;
    s.guildName = g.name;
    s.memberCount = g.memberCount;
    $("cfgGuildName").textContent = g.name;
    $("cfgGuildTag").textContent = "Serveur sélectionné";

    const [details, config] = await Promise.all([
      P0.api(`/api/guilds/${g.id}`),
      P0.api(`/api/guilds/${g.id}/config`),
    ]);
    s.details = details;
    s.config = config;

    // Général
    P0.fillSelect($("verifiedRoleId"), details.roles, config.verifiedRoleId, "Aucun", "@");
    // le rôle staff n'est jamais attribué par le bot : tous les rôles sont permis (pas de grisage)
    P0.fillSelect($("staffRoleId"), details.roles.map((r) => ({ id: r.id, name: r.name })), config.staffRoleId, "Aucun", "@");
    P0.fillSelect($("logChannelId"), details.channels, config.logChannelId, "Aucun", "#");
    P0.fillSelect($("ticketCategoryId"), details.categories, config.ticketCategoryId, "Aucune");
    P0.setStatus($("saveStatus"), "");

    for (const m of P0.modules) await m.load(details, config);

    showTab("general");
    showView("config");
  }

  // ---------- Sauvegarde de l'onglet Général ----------
  $("saveBtn").addEventListener("click", async () => {
    const s = P0.state;
    if (!s.guildId) return;
    const status = $("saveStatus");
    P0.setStatus(status, "Enregistrement...");
    try {
      s.config = await P0.api(`/api/guilds/${s.guildId}/config`, {
        method: "PUT",
        body: JSON.stringify({
          verifiedRoleId: $("verifiedRoleId").value || null,
          staffRoleId: $("staffRoleId").value || null,
          logChannelId: $("logChannelId").value || null,
          ticketCategoryId: $("ticketCategoryId").value || null,
        }),
      });
      P0.setStatus(status, "✓ Configuration enregistrée", "success");
    } catch (err) {
      P0.setStatus(status, `✕ ${P0.errorText(err, "Échec de l'enregistrement")}`, "error");
    }
  });

  // ---------- Démarrage (appelé sur l'événement load) ----------
  P0.boot = async function () {
    $("loginBtn").href = `${API_BASE}/api/auth/login`;
    try {
      const me = await P0.api("/api/auth/me");
      $("userBadge").hidden = false;
      $("userName").textContent = me.username;
      $("userAvatar").src = me.avatar
        ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
        : "https://cdn.discordapp.com/embed/avatars/0.png";
      await loadGuildList();
    } catch (err) {
      showView("auth");
      const msg = $("authError");
      msg.hidden = err.code !== "network";
    }
  };
})();
