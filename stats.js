// Stats réelles de l'accueil, lues sur l'API du bot (GET /api/stats). Si l'API est injoignable : "—".
(function () {
  const { API_BASE } = window.P0_CONFIG || { API_BASE: "http://localhost:3001" };
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

  function formatCount(n) {
    return new Intl.NumberFormat("fr-FR").format(n);
  }

  function formatUptime(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${Math.max(minutes, 1)} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} h`;
    return `${Math.floor(hours / 24)} j`;
  }

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      if (!res.ok) throw new Error(res.status);
      const s = await res.json();
      set("statServers", formatCount(s.servers));
      set("statMembers", formatCount(s.members));
      set("statUptime", formatUptime(s.uptimeMs));
    } catch {
      for (const id of ["statServers", "statMembers", "statUptime"]) set(id, "—");
    }
  }

  loadStats();
  setInterval(loadStats, 60000);
})();
