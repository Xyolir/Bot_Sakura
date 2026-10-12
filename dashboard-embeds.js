// Éditeurs d'embeds : fabrique (réutilisée par les panneaux de rôles) + éditeurs Messages / Tickets.
(function () {
  const P0 = window.P0Dashboard;
  const { $, h } = P0;

  const FIELDS = ["Title", "Description", "Color", "ImageUrl", "ThumbnailUrl", "Footer"];

  // Une ligne « libellé + champ ». Les IDs gardent la convention  <prefix>Title, <prefix>Description…
  function field(prefix, name, label, control, hint) {
    const id = `${prefix}${name}`;
    control.id = id;
    return [h("label", { for: id }, label, hint ? h("span", { class: "hint", text: ` — ${hint}` }) : null), control];
  }

  // Construit { fields, preview } pour un embed. opts : { channel, buttonLabel, hint }
  P0.buildEmbedEditor = function (prefix, opts = {}) {
    const fields = h("div", { class: "embed-fields" });

    if (opts.channel) fields.append(...field(prefix, "ChannelId", "Salon", h("select")));
    fields.append(
      ...field(prefix, "Title", "Titre", h("input", { type: "text", maxlength: 256 })),
      ...field(prefix, "Description", "Description", h("textarea", { maxlength: 4096, rows: 4 }), opts.hint || "variables : {user} {server} {memberCount}"),
      ...field(prefix, "Color", "Couleur", h("input", { type: "color" })),
      ...field(prefix, "ImageUrl", "Image (URL, bandeau)", h("input", { type: "text", placeholder: "https://..." })),
      ...field(prefix, "ThumbnailUrl", "Vignette (URL, petite image)", h("input", { type: "text", placeholder: "https://..." })),
      ...field(prefix, "Footer", "Footer", h("input", { type: "text", maxlength: 2048 }))
    );
    if (opts.buttonLabel) fields.append(...field(prefix, "ButtonLabel", "Texte du bouton", h("input", { type: "text", maxlength: 80 })));

    const preview = h("div", { class: "embed-preview" },
      h("div", { class: "dc-embed" },
        h("div", { class: "dc-embed-bar", id: `${prefix}PreviewBar` }),
        h("div", { class: "dc-embed-content" },
          h("div", { class: "dc-embed-title", id: `${prefix}PreviewTitle` }),
          h("div", { class: "dc-embed-desc", id: `${prefix}PreviewDesc` }),
          h("img", { class: "dc-embed-image", id: `${prefix}PreviewImage`, alt: "", hidden: true }),
          h("div", { class: "dc-embed-footer", id: `${prefix}PreviewFooter` })
        ),
        h("img", { class: "dc-embed-thumb", id: `${prefix}PreviewThumb`, alt: "", hidden: true })
      ),
      h("div", { class: "dc-buttons", id: `${prefix}PreviewButtons` })
    );

    for (const name of FIELDS) {
      fields.querySelector(`#${prefix}${name}`).addEventListener("input", () => P0.updateEmbedPreview(prefix));
    }
    return { fields, preview, body: h("div", { class: "embed-editor-body" }, fields, preview) };
  };

  P0.readEmbed = (prefix) => Object.fromEntries(FIELDS.map((f) => [f[0].toLowerCase() + f.slice(1), $(`${prefix}${f}`).value]));

  P0.writeEmbed = function (prefix, embed = {}) {
    $(`${prefix}Title`).value = embed.title || "";
    $(`${prefix}Description`).value = embed.description || "";
    $(`${prefix}Color`).value = embed.color || "#5865f2";
    $(`${prefix}ImageUrl`).value = embed.imageUrl || "";
    $(`${prefix}ThumbnailUrl`).value = embed.thumbnailUrl || "";
    $(`${prefix}Footer`).value = embed.footer || "";
    P0.updateEmbedPreview(prefix);
  };

  // Image de prévisualisation : seules les URLs http(s) sont chargées
  function httpUrl(v) {
    try {
      const u = new URL(String(v).trim());
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
    } catch {
      return "";
    }
  }

  P0.updateEmbedPreview = function (prefix) {
    const e = P0.readEmbed(prefix);
    $(`${prefix}PreviewBar`).style.background = e.color || "#5865f2";
    $(`${prefix}PreviewTitle`).textContent = P0.previewVars(e.title);
    $(`${prefix}PreviewTitle`).hidden = !e.title;
    P0.setDiscordText($(`${prefix}PreviewDesc`), e.description);
    $(`${prefix}PreviewFooter`).textContent = P0.previewVars(e.footer);
    $(`${prefix}PreviewFooter`).hidden = !e.footer;
    for (const [id, url] of [[`${prefix}PreviewImage`, httpUrl(e.imageUrl)], [`${prefix}PreviewThumb`, httpUrl(e.thumbnailUrl)]]) {
      const img = $(id);
      if (url) { img.src = url; img.hidden = false; } else { img.hidden = true; }
    }
  };

  // ---------- Éditeurs Messages / Tickets ----------
  const DEFS = [
    { key: "welcome", pane: "messages", icon: "👋", title: "Message de bienvenue", channel: true, toggle: true, publish: true },
    { key: "reglement", pane: "messages", icon: "📜", title: "Règlement", channel: true, publish: true, button: { fallback: "J'accepte le règlement", emoji: "✅", cls: "green" } },
    { key: "tickets", pane: "tickets", icon: "🎫", title: "Panneau de tickets", channel: true, publish: true, button: { fallback: "Ouvrir un ticket", emoji: "🎫", cls: "blue" } },
    { key: "ticketWelcome", pane: "tickets", icon: "💬", title: "Message dans le ticket", hint: "variables : {user} {username} {server}" },
  ];

  const statusEl = (key) => $(`${key}Status`);

  function buildCard(def) {
    const { key } = def;
    const editor = P0.buildEmbedEditor(key, { channel: def.channel, buttonLabel: Boolean(def.button), hint: def.hint });

    const header = h("div", { class: "embed-card-header" }, h("h3", { text: `${def.icon} ${def.title}` }));
    if (def.toggle) {
      header.append(h("label", { class: "switch", "aria-label": "Activer" },
        h("input", { type: "checkbox", id: `${key}Enabled` }), h("span", { class: "slider" })));
    }

    if (def.button) {
      editor.preview.querySelector(`#${key}PreviewButtons`).append(
        h("button", { type: "button", class: `dc-fake-button ${def.button.cls}`, id: `${key}PreviewBtn`, tabindex: "-1" })
      );
      editor.fields.querySelector(`#${key}ButtonLabel`).addEventListener("input", () => updateButtonPreview(def));
    }

    const actions = h("div", { class: "save-row" }, h("span", { class: "save-status", id: `${key}Status`, role: "status" }));
    if (def.publish) actions.append(h("button", { class: "btn btn-small", id: `${key}PublishBtn`, text: "Publier maintenant", onclick: () => publish(def) }));
    actions.append(h("button", { class: "btn", id: `${key}SaveBtn`, text: "Enregistrer", onclick: () => save(def) }));

    return h("div", { class: "card embed-card" }, header, editor.body, actions);
  }

  function updateButtonPreview(def) {
    const label = $(`${def.key}ButtonLabel`).value || def.button.fallback;
    $(`${def.key}PreviewBtn`).textContent = `${def.button.emoji} ${label}`;
  }

  async function save(def) {
    const { key } = def;
    const st = statusEl(key);
    const s = P0.state;
    const payload = { embed: P0.readEmbed(key) };
    if (def.channel) payload.channelId = $(`${key}ChannelId`).value || null;
    if (def.toggle) payload.enabled = $(`${key}Enabled`).checked;
    if (def.button) payload.buttonLabel = $(`${key}ButtonLabel`).value;

    P0.setStatus(st, "Enregistrement...");
    try {
      await P0.api(`/api/guilds/${s.guildId}/messages/${key}`, { method: "PUT", body: JSON.stringify(payload) });
      P0.setStatus(st, "✓ Enregistré", "success");
      return true;
    } catch (err) {
      P0.setStatus(st, `✕ ${P0.errorText(err, "Échec de l'enregistrement")}`, "error");
      return false;
    }
  }

  async function publish(def) {
    const { key } = def;
    const st = statusEl(key);
    if (!$(`${key}ChannelId`).value) return P0.setStatus(st, "✕ Choisis d'abord un salon", "error");

    if (!(await save(def))) return; // on enregistre toujours avant de publier
    P0.setStatus(st, "Publication...");
    try {
      const res = await P0.api(`/api/guilds/${P0.state.guildId}/messages/${key}/publish`, { method: "POST", body: "{}" });
      const warn = P0.warningText(res.warnings);
      P0.setStatus(st, `✓ Publié sur Discord${warn ? ` — ⚠ ${warn}` : ""}`, warn ? "" : "success");
    } catch (err) {
      P0.setStatus(st, `✕ ${P0.errorText(err, "Échec de la publication")}`, "error");
    }
  }

  // Construit les cartes une seule fois ; load() ne fait que remplir les valeurs
  for (const def of DEFS) $(`editors-${def.pane}`).append(buildCard(def));

  P0.modules.push({
    async load(details, config) {
      for (const def of DEFS) {
        const { key } = def;
        const msg = config[key];
        if (def.channel) P0.fillSelect($(`${key}ChannelId`), details.channels, msg.channelId, "Aucun", "#");
        if (def.toggle) $(`${key}Enabled`).checked = Boolean(msg.enabled);
        if (def.button) {
          $(`${key}ButtonLabel`).value = msg.buttonLabel || def.button.fallback;
          updateButtonPreview(def);
        }
        P0.writeEmbed(key, msg.embed);
        P0.setStatus(statusEl(key), "");
      }
    },
  });
})();
