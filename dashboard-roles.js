// Onglet « Rôles » : panneaux de boutons-rôles (GET/PUT/DELETE /reaction-roles, POST /:id/publish)
(function () {
  const P0 = window.P0Dashboard;
  const { $, h } = P0;

  let panels = [];       // { id|null, uid, name, channelId, messageId, embed, roles: [{ roleId, label }] }
  let limits = { maxPanels: 10, maxRoles: 10 };
  let uidCounter = 0;

  const prefixOf = (p) => `rr_${p.uid}`;
  const status = () => $("rolesStatus");

  function fromServer(p) {
    return { id: p.id, uid: `s${++uidCounter}`, name: p.name, channelId: p.channelId, messageId: p.messageId, embed: p.embed, roles: p.roles.map((r) => ({ ...r })) };
  }

  function blankPanel() {
    return {
      id: null, uid: `n${++uidCounter}`, name: "Nouveau panneau", channelId: null, messageId: null, roles: [],
      embed: { title: "🎭 Choisis tes rôles", description: "Clique sur un bouton pour obtenir (ou retirer) le rôle.", color: "#5865f2", imageUrl: "", thumbnailUrl: "", footer: "" },
    };
  }

  // Lit le DOM → état (avant toute sauvegarde ou nouveau rendu)
  function collect() {
    for (const p of panels) {
      const pre = prefixOf(p);
      if (!$(`${pre}Name`)) continue;
      p.name = $(`${pre}Name`).value;
      p.channelId = $(`${pre}ChannelId`).value || null;
      p.embed = P0.readEmbed(pre);
      p.roles = [...document.querySelectorAll(`#${pre}Roles .role-row`)]
        .map((row) => ({ roleId: row.querySelector("select").value, label: row.querySelector("input").value }))
        .filter((r) => r.roleId);
    }
  }

  function roleName(roleId) {
    return P0.state.details.roles.find((r) => r.id === roleId)?.name || "Rôle";
  }

  function updateButtons(p) {
    const box = $(`${prefixOf(p)}PreviewButtons`);
    box.innerHTML = "";
    const pre = prefixOf(p);
    for (const row of document.querySelectorAll(`#${pre}Roles .role-row`)) {
      const id = row.querySelector("select").value;
      if (!id) continue;
      box.append(h("button", { type: "button", class: "dc-fake-button grey", tabindex: "-1", text: row.querySelector("input").value || roleName(id) }));
    }
  }

  function roleRow(p, role) {
    const details = P0.state.details;
    const select = h("select", { "aria-label": "Rôle" });
    const taken = new Set(p.roles.map((r) => r.roleId).filter((id) => id !== role.roleId));
    P0.fillSelect(select, details.roles.filter((r) => !taken.has(r.id)), role.roleId, "Choisir un rôle", "@");

    const current = details.roles.find((r) => r.id === role.roleId);
    const warn = h("span", { class: "role-warn", hidden: !current || current.assignable !== false,
      text: current && current.assignable === false ? `⚠ ${P0.roleReason(current.reason)}` : "" });

    const label = h("input", { type: "text", maxlength: 80, placeholder: "Texte du bouton (vide = nom du rôle)", value: role.label || "", "aria-label": "Texte du bouton" });
    label.addEventListener("input", () => updateButtons(p));
    select.addEventListener("change", () => { collect(); render(); });

    const remove = h("button", { type: "button", class: "btn btn-small btn-ghost", text: "✕", "aria-label": "Retirer ce rôle",
      onclick: () => { collect(); p.roles = p.roles.filter((r) => r.roleId !== role.roleId); render(); } });

    return h("div", { class: "role-row" }, h("div", { class: "role-row-main" }, select, label, remove), warn);
  }

  function panelCard(p) {
    const pre = prefixOf(p);
    const editor = P0.buildEmbedEditor(pre, { channel: true, hint: "variables : {server} {memberCount}" });

    const roleList = h("div", { class: "role-list", id: `${pre}Roles` }, p.roles.map((r) => roleRow(p, r)));
    const addBtn = h("button", { type: "button", class: "btn btn-small", text: "+ Ajouter un rôle",
      disabled: p.roles.length >= limits.maxRoles,
      onclick: () => { collect(); p.roles.push({ roleId: "", label: "" }); render(); } });
    const rolesBox = h("div", { class: "roles-box" }, h("h4", { text: `Rôles (${p.roles.length}/${limits.maxRoles})` }), roleList, addBtn);
    editor.fields.append(rolesBox);

    const name = h("input", { type: "text", id: `${pre}Name`, maxlength: 50, value: p.name, class: "panel-name", "aria-label": "Nom du panneau" });
    const badge = h("span", { class: "badge" + (p.messageId ? " ok" : ""), text: p.messageId ? "Publié" : p.id ? "Non publié" : "Nouveau (non enregistré)" });
    const header = h("div", { class: "embed-card-header" }, h("div", { class: "panel-title" }, name, badge),
      h("button", { type: "button", class: "btn btn-small btn-danger", text: "Supprimer", onclick: () => remove(p) }));

    const actions = h("div", { class: "save-row" }, h("span", { class: "save-status", id: `${pre}Status`, role: "status" }),
      h("button", { type: "button", class: "btn btn-small", text: p.messageId ? "Mettre à jour sur Discord" : "Publier maintenant", onclick: () => publish(p) }));

    return { card: h("div", { class: "card embed-card" }, header, editor.body, actions), pre };
  }

  function render() {
    const list = $("panelList");
    list.innerHTML = "";
    if (!panels.length) list.append(h("p", { class: "empty", text: "Aucun panneau pour le moment. Clique sur « Nouveau panneau »." }));

    for (const p of panels) {
      const { card, pre } = panelCard(p);
      list.append(card);
      P0.fillSelect($(`${pre}ChannelId`), P0.state.details.channels, p.channelId, "Aucun", "#");
      P0.writeEmbed(pre, p.embed);
      updateButtons(p);
    }
    $("addPanelBtn").disabled = panels.length >= limits.maxPanels;
  }

  async function saveAll() {
    collect();
    const known = new Set(panels.map((p) => p.id).filter(Boolean));
    const unsaved = panels.filter((p) => !p.id);
    const body = { panels: panels.map((p) => ({ id: p.id, name: p.name, channelId: p.channelId, embed: p.embed, roles: p.roles })) };

    const res = await P0.api(`/api/guilds/${P0.state.guildId}/reaction-roles`, { method: "PUT", body: JSON.stringify(body) });
    const created = res.panels.filter((p) => !known.has(p.id));
    panels = res.panels.map(fromServer);
    // ids attribués aux panneaux créés, dans l'ordre d'envoi
    return unsaved.map((_, i) => created[i]?.id).filter(Boolean);
  }

  async function onSave() {
    P0.setStatus(status(), "Enregistrement...");
    try {
      await saveAll();
      render();
      P0.setStatus(status(), "✓ Panneaux enregistrés (clique sur « Publier » pour mettre à jour Discord)", "success");
    } catch (err) {
      P0.setStatus(status(), `✕ ${P0.errorText(err, "Échec de l'enregistrement")}`, "error");
    }
  }

  async function publish(p) {
    collect();
    const wasNewIndex = panels.filter((x) => !x.id).indexOf(p); // -1 si déjà enregistré
    const existingId = p.id;
    const st = () => $(`${prefixOf(p)}Status`) || status();

    if (!p.channelId) return P0.setStatus(st(), "✕ Choisis d'abord un salon", "error");
    if (!p.roles.length) return P0.setStatus(st(), "✕ Ajoute au moins un rôle", "error");

    P0.setStatus(st(), "Enregistrement...");
    let panelId = existingId;
    try {
      const newIds = await saveAll();
      if (wasNewIndex >= 0) panelId = newIds[wasNewIndex];
      render();
    } catch (err) {
      return P0.setStatus(st(), `✕ ${P0.errorText(err, "Échec de l'enregistrement")}`, "error");
    }

    const target = panels.find((x) => x.id === panelId);
    const statusAfter = (text, kind) => P0.setStatus(target ? $(`${prefixOf(target)}Status`) : status(), text, kind);
    statusAfter("Publication...");
    try {
      await P0.api(`/api/guilds/${P0.state.guildId}/reaction-roles/${panelId}/publish`, { method: "POST", body: "{}" });
      await reload();
      const fresh = panels.find((x) => x.id === panelId);
      P0.setStatus($(`${prefixOf(fresh)}Status`), "✓ Publié sur Discord", "success");
    } catch (err) {
      statusAfter(`✕ ${P0.errorText(err, "Échec de la publication")}`, "error");
    }
  }

  async function remove(p) {
    collect();
    if (!confirm(`Supprimer le panneau « ${p.name} » ?${p.messageId ? " Son message sur Discord sera supprimé." : ""}`)) return;
    if (p.id) {
      try {
        await P0.api(`/api/guilds/${P0.state.guildId}/reaction-roles/${p.id}`, { method: "DELETE" });
      } catch (err) {
        return P0.setStatus(status(), `✕ ${P0.errorText(err, "Suppression impossible")}`, "error");
      }
    }
    panels = panels.filter((x) => x !== p);
    render();
    P0.setStatus(status(), "✓ Panneau supprimé", "success");
  }

  async function reload() {
    const res = await P0.api(`/api/guilds/${P0.state.guildId}/reaction-roles`);
    limits = { maxPanels: res.maxPanels, maxRoles: res.maxRoles };
    panels = res.panels.map(fromServer);
    render();
  }

  $("addPanelBtn").addEventListener("click", () => { collect(); panels.push(blankPanel()); render(); });
  $("saveRolesBtn").addEventListener("click", onSave);

  P0.modules.push({
    async load(details) {
      P0.setStatus(status(), "");
      const allowed = details.permissions.manageRoles;
      $("rolesNoPerm").hidden = allowed;
      $("rolesBody").hidden = !allowed;
      panels = [];
      if (allowed) await reload();
    },
  });
})();
