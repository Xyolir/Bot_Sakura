// Onglet « Automod » (GET/PUT /automod)
(function () {
  const P0 = window.P0Dashboard;
  const { $, h } = P0;

  const TOGGLES = ["enabled", "antiInvite", "antiLinks", "antiCaps", "antiMentions", "antiSpam", "notifyUser"];
  const NUMBERS = ["timeoutMinutes", "spamLimit", "spamWindowSec", "capsMinLength", "capsMaxPercent", "maxMentions"];
  const SELECTS = ["action", "badWordsMode"];

  let badWords = [];
  let linkWhitelist = [];

  // Liste de « chips » éditable (mots filtrés, domaines autorisés)
  function chipList(containerId, getList, setList) {
    const box = $(containerId);
    box.innerHTML = "";
    for (const item of getList()) {
      box.append(h("span", { class: "chip" }, item,
        h("button", { type: "button", "aria-label": `Retirer ${item}`, text: "✕",
          onclick: () => { setList(getList().filter((x) => x !== item)); chipList(containerId, getList, setList); } })));
    }
  }

  function wireChipInput({ inputId, addId, normalize, getList, setList, listId }) {
    const add = () => {
      const input = $(inputId);
      const v = normalize(input.value);
      if (v && !getList().includes(v) && getList().length < 200) {
        setList([...getList(), v]);
        chipList(listId, getList, setList);
      }
      input.value = "";
    };
    $(addId).addEventListener("click", add);
    $(inputId).addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  }

  const renderWords = () => chipList("am_badWords", () => badWords, (l) => (badWords = l));
  const renderLinks = () => chipList("am_linkWhitelist", () => linkWhitelist, (l) => (linkWhitelist = l));

  wireChipInput({ inputId: "am_wordInput", addId: "am_wordAdd", listId: "am_badWords",
    normalize: (v) => v.trim().toLowerCase().slice(0, 50), getList: () => badWords, setList: (l) => (badWords = l) });
  wireChipInput({ inputId: "am_linkInput", addId: "am_linkAdd", listId: "am_linkWhitelist",
    normalize: (v) => v.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/^www\./, ""),
    getList: () => linkWhitelist, setList: (l) => (linkWhitelist = l) });

  // Liste de cases à cocher (rôles / salons exemptés)
  function checkList(containerId, items, selected, prefix) {
    const box = $(containerId);
    box.innerHTML = "";
    if (!items.length) box.append(h("p", { class: "field-help", text: "Aucun élément." }));
    for (const item of items) {
      const cb = h("input", { type: "checkbox", value: item.id });
      cb.checked = selected.includes(item.id);
      box.append(h("label", { class: "check-row" }, cb, `${prefix}${item.name}`));
    }
  }

  const checked = (containerId) => [...document.querySelectorAll(`#${containerId} input:checked`)].map((i) => i.value);

  function fill(a, details) {
    for (const k of TOGGLES) $(`am_${k}`).checked = Boolean(a[k]);
    for (const k of NUMBERS) $(`am_${k}`).value = a[k];
    for (const k of SELECTS) $(`am_${k}`).value = a[k];
    badWords = [...a.badWords];
    linkWhitelist = [...a.linkWhitelist];
    renderWords();
    renderLinks();
    checkList("am_exemptRoles", details.roles, a.exemptRoleIds, "@");
    checkList("am_exemptChannels", details.channels, a.exemptChannelIds, "#");
  }

  function read() {
    const out = { badWords, linkWhitelist, exemptRoleIds: checked("am_exemptRoles"), exemptChannelIds: checked("am_exemptChannels") };
    for (const k of TOGGLES) out[k] = $(`am_${k}`).checked;
    for (const k of NUMBERS) out[k] = Number($(`am_${k}`).value);
    for (const k of SELECTS) out[k] = $(`am_${k}`).value;
    return out;
  }

  $("saveAutomodBtn").addEventListener("click", async () => {
    const st = $("automodStatus");
    P0.setStatus(st, "Enregistrement...");
    try {
      const saved = await P0.api(`/api/guilds/${P0.state.guildId}/automod`, { method: "PUT", body: JSON.stringify(read()) });
      fill(saved, P0.state.details); // le serveur normalise (bornes, domaines…) : on affiche ce qui est vraiment enregistré
      P0.setStatus(st, "✓ Automod enregistré", "success");
    } catch (err) {
      P0.setStatus(st, `✕ ${P0.errorText(err, "Échec de l'enregistrement")}`, "error");
    }
  });

  P0.modules.push({
    load(details, config) {
      fill(config.automod, details);
      P0.setStatus($("automodStatus"), "");
    },
  });
})();
