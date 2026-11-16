(() => {
  "use strict";

  const MODULE_ID = "evil-toolbox";
  const SYSTEM_ID = "CoC7";
  const MONITOR_FLAG_KEY = "coc7Monitor";
  const BATCH_DELAY_MS = 220;

  const stateByActor = new Map();
  const pendingByActor = new Map();
  let notificationApp = null;

  function isMonitoredActor(actor) {
    return actor?.documentName === "Actor" &&
      actor.type === "character" &&
      actor.system?.attribs?.hp &&
      actor.system?.attribs?.san;
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function snapshotActor(actor) {
    const hp = actor.system?.attribs?.hp ?? {};
    const san = actor.system?.attribs?.san ?? {};
    const conditions = actor.system?.conditions ?? {};

    return {
      hp: numberOrZero(hp.value),
      hpMax: numberOrZero(hp.max),
      san: numberOrZero(san.value),
      dailyLoss: numberOrZero(san.dailyLoss),
      dailyLimit: numberOrZero(san.dailyLimit),
      criticalWounds: conditions.criticalWounds?.value === true,
      unconscious: conditions.unconscious?.value === true,
      dying: conditions.dying?.value === true,
      dead: conditions.dead?.value === true,
      tempoInsane: conditions.tempoInsane?.value === true,
      indefInsane: conditions.indefInsane?.value === true
    };
  }

  function cloneState(state) {
    return state ? { ...state } : null;
  }

  function scheduleActorAnalysis(actor) {
    if (!isMonitoredActor(actor)) return;

    let pending = pendingByActor.get(actor.id);
    if (!pending) {
      pending = {
        before: cloneState(stateByActor.get(actor.id) ?? snapshotActor(actor)),
        timer: null
      };
      pendingByActor.set(actor.id, pending);
    }

    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      void flushActorAnalysis(actor.id);
    }, BATCH_DELAY_MS);
  }

  function scheduleEffectAnalysis(effect) {
    const actor = effect?.parent;
    if (!isMonitoredActor(actor)) return;
    scheduleActorAnalysis(actor);
  }

  function makeAlert({ kind, theme, icon, title, summary, steps }) {
    return { kind, theme, icon, title, summary, steps };
  }

  function physicalAlert(actor, before, after) {
    const hpLoss = Math.max(0, before.hp - after.hp);
    const hpGain = Math.max(0, after.hp - before.hp);
    const hpChanged = before.hp !== after.hp;
    const halfMax = Math.ceil(after.hpMax / 2);

    // Priorité absolue : l'état Mort posé par CoC7 lors du même événement de PV.
    if (hpChanged && !before.dead && after.dead) {
      return makeAlert({
        kind: "instant-death",
        theme: "Santé — Mort instantanée",
        icon: "fa-solid fa-skull",
        title: "Mort instantanée",
        summary: hpLoss > 0
          ? `${actor.name} perd ${hpLoss} PV et passe à l’état Mort.`
          : `${actor.name} passe à l’état Mort.`,
        steps: [
          "Le personnage meurt immédiatement."
        ]
      });
    }

    // Passage à 0 PV : regrouper les états produits par CoC7 pour éviter les doublons.
    if (before.hp > 0 && after.hp === 0) {
      if (after.dying || after.criticalWounds) {
        return makeAlert({
          kind: "dying",
          theme: "Santé — Personnage mourant",
          icon: "fa-solid fa-heart-pulse",
          title: "Personnage mourant",
          summary: after.criticalWounds
            ? `${actor.name} tombe à 0 PV avec une Blessure grave.`
            : `${actor.name} tombe à 0 PV et passe à l’état Mourant.`,
          steps: [
            "Le personnage est inconscient et mourant.",
            "Fais un test de CON à la fin du round suivant, puis à chaque round.",
            "Échec au test de CON : mort.",
            "Premiers soins réussis : stabilisation provisoire."
          ]
        });
      }

      return makeAlert({
        kind: "unconscious",
        theme: "Santé — Inconscience",
        icon: "fa-solid fa-bed",
        title: "Inconscience",
        summary: `${actor.name} tombe à 0 PV sans Blessure grave.`,
        steps: [
          "Le personnage est inconscient, mais pas mourant.",
          "Pas de test de CON de mort imminente."
        ]
      });
    }

    // Blessure grave créée par un impact, sans passage à 0 PV.
    if (hpLoss > 0 && !before.criticalWounds && after.criticalWounds) {
      return makeAlert({
        kind: "major-wound",
        theme: "Santé — Blessure grave",
        icon: "fa-solid fa-user-injured",
        title: "Blessure grave",
        summary: `${actor.name} subit ${hpLoss} dégâts (PV max : ${after.hpMax}).`,
        steps: [
          "Le personnage subit une Blessure grave.",
          "Fais un test de CON.",
          "Échec : le personnage tombe inconscient."
        ]
      });
    }

    // Récupération : le seuil est franchi mais l'état est encore présent.
    if (hpGain > 0 && after.criticalWounds && halfMax > 0 && before.hp < halfMax && after.hp >= halfMax) {
      return makeAlert({
        kind: "major-wound-recovery",
        theme: "Santé — Fin de blessure grave",
        icon: "fa-solid fa-bandage",
        title: "Fin de blessure grave",
        summary: `${actor.name} possède encore Blessure grave avec ${after.hp}/${after.hpMax} PV.`,
        steps: [
          "Retire l’état Blessure grave : les PV ont atteint au moins la moitié du maximum."
        ]
      });
    }

    return null;
  }

  function sanityAlert(actor, before, after) {
    const sanLoss = Math.max(0, before.san - after.san);
    const dailyLossIncrease = Math.max(0, after.dailyLoss - before.dailyLoss);

    // Un véritable événement de perte SAN suivi par CoC7 augmente son compteur dédié.
    if (sanLoss <= 0 || dailyLossIncrease <= 0) return null;

    // SAN 0 prime sur toutes les autres formes de folie.
    if (before.san > 0 && after.san === 0) {
      return makeAlert({
        kind: "permanent-insanity",
        theme: "SAN — Folie permanente",
        icon: "fa-solid fa-brain",
        title: "Folie permanente",
        summary: `${actor.name} tombe à 0 SAN.`,
        steps: [
          "Le personnage sombre dans une folie permanente.",
          "L’investigateur cesse normalement d’être un personnage joueur."
        ]
      });
    }

    // La folie sous-jacente doit être antérieure à cette nouvelle perte.
    if (before.indefInsane) {
      return makeAlert({
        kind: "underlying-insanity-loss",
        theme: "SAN — Nouvelle crise de folie",
        icon: "fa-solid fa-brain",
        title: "Nouvelle perte de SAN pendant une folie sous-jacente",
        summary: `${actor.name} perd ${sanLoss} SAN alors qu’une folie sous-jacente est déjà active.`,
        steps: [
          "Déclenche immédiatement une nouvelle crise de folie.",
          "Ne fais pas de nouveau test d’INT.",
          "Résous normalement la crise de folie."
        ]
      });
    }

    const largeSingleLoss = sanLoss >= 5;
    const dailyLimit = after.dailyLimit;
    const crossedDailyLimit = dailyLimit > 0 &&
      before.dailyLoss < dailyLimit &&
      after.dailyLoss >= dailyLimit;

    // Une même perte peut franchir les deux seuils : un seul rappel, avec les deux suites.
    if (largeSingleLoss && crossedDailyLimit) {
      return makeAlert({
        kind: "san-double-threshold",
        theme: "SAN — Deux seuils atteints",
        icon: "fa-solid fa-brain",
        title: "Deux seuils de SAN atteints",
        summary: `${actor.name} perd ${sanLoss} SAN en une fois et atteint aussi le seuil cumulé de ${dailyLimit}.`,
        steps: [
          "Pour la perte de 5 SAN ou plus : fais un test d’INT.",
          "Réussite : folie temporaire pendant 1D10 heures et crise de folie.",
          "Échec : pas de folie temporaire due à cette perte.",
          "Si le cumul appartient bien à la période concernée : applique aussi la folie persistante et résous une crise de folie."
        ]
      });
    }

    if (largeSingleLoss) {
      return makeAlert({
        kind: "large-san-loss",
        theme: "SAN — Traumatisme important",
        icon: "fa-solid fa-brain",
        title: "Perte importante de SAN",
        summary: `${actor.name} perd ${sanLoss} SAN en une seule fois.`,
        steps: [
          "Fais un test d’INT.",
          "Réussite : folie temporaire pendant 1D10 heures et crise de folie.",
          "Échec : pas de folie temporaire due à cette perte."
        ]
      });
    }

    if (crossedDailyLimit) {
      return makeAlert({
        kind: "san-daily-threshold",
        theme: "SAN — Seuil du cinquième atteint",
        icon: "fa-solid fa-brain",
        title: "Seuil du cinquième atteint",
        summary: `${actor.name} atteint ${after.dailyLoss}/${dailyLimit} points de perte cumulée de SAN.`,
        steps: [
          "Si ce cumul appartient bien à la période concernée : applique la folie persistante.",
          "Résous une crise de folie."
        ]
      });
    }

    return null;
  }

  async function flushActorAnalysis(actorId) {
    const pending = pendingByActor.get(actorId);
    if (!pending) return;
    pendingByActor.delete(actorId);
    if (pending.timer) clearTimeout(pending.timer);

    const actor = game.actors?.get(actorId);
    if (!isMonitoredActor(actor)) {
      stateByActor.delete(actorId);
      return;
    }

    const after = snapshotActor(actor);
    const before = pending.before ?? cloneState(after);
    stateByActor.set(actorId, after);

    // Tous les clients MJ maintiennent leur état local, mais un seul émet les rappels.
    if (!game.user?.isActiveGM) return;

    const alerts = [
      physicalAlert(actor, before, after),
      sanityAlert(actor, before, after)
    ].filter(Boolean);
    if (!alerts.length) return;

    try {
      for (const alert of alerts) {
        await sendMonitorWhisper(actor, alert);
      }
      // Une seule petite popup reste affichée. En cas exceptionnel de deux alertes
      // simultanées, le chat contient les deux marches à suivre détaillées.
      if (alerts.length === 1) {
        await showMonitorNotification(alerts[0]);
      } else {
        await showMonitorNotification({
          theme: `Monitoring CoC7 — ${alerts.length} alertes`,
          icon: "fa-solid fa-triangle-exclamation"
        });
      }
    } catch (error) {
      console.error("Evil Toolbox | Assistant MJ CoC7 | Notification impossible", error);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function alertToChatHtml(alert) {
    const steps = alert.steps
      .map(step => `→ ${escapeHtml(step)}`)
      .join("<br>");

    return [
      `<p><strong>${escapeHtml(alert.title)}</strong></p>`,
      `<p>${escapeHtml(alert.summary)}</p>`,
      `<p>${steps}</p>`
    ].join("");
  }

  async function sendMonitorWhisper(actor, alert) {
    return ChatMessage.create({
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ alias: "Assistant MJ CoC7" }),
      whisper: [game.user.id],
      content: alertToChatHtml(alert),
      flags: {
        [MODULE_ID]: {
          [MONITOR_FLAG_KEY]: {
            kind: alert.kind,
            actorId: actor.id
          }
        }
      }
    });
  }

  async function showMonitorNotification(alert) {
    if (notificationApp?.rendered) await notificationApp.close();

    notificationApp = new EvilbramCoc7MonitorNotification({
      theme: alert.theme,
      icon: alert.icon
    });

    const app = notificationApp;
    app.addEventListener("close", () => {
      if (notificationApp === app) notificationApp = null;
    });
    await app.render({ force: true });
  }

  class EvilbramCoc7MonitorNotification extends foundry.applications.api.HandlebarsApplicationMixin(
    foundry.applications.api.ApplicationV2
  ) {
    constructor({ theme, icon }) {
      super({ window: { title: "Assistant MJ CoC7" } });
      this.theme = theme;
      this.icon = icon;
    }

    static DEFAULT_OPTIONS = {
      id: "evilbram-coc7-monitor-notification",
      classes: ["evilbram-toolbox", "evilbram-coc7-monitor-notification"],
      position: {
        width: 330,
        height: "auto"
      },
      window: {
        title: "Assistant MJ CoC7",
        icon: "fa-solid fa-triangle-exclamation"
      }
    };

    static PARTS = {
      content: {
        template: "modules/evil-toolbox/templates/coc7-monitor-notification.hbs"
      }
    };

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      return {
        ...context,
        theme: this.theme,
        icon: this.icon
      };
    }
  }

  Hooks.once("ready", () => {
    // Toolbox est transversal : le monitoring CoC7 ne s'initialise que sur un monde CoC7.
    if (game.system?.id !== SYSTEM_ID) {
      console.log(`Evil Toolbox | Assistant MJ CoC7 inactif (système courant : ${game.system?.id ?? "inconnu"})`);
      return;
    }

    // Aucun monitoring sur les clients joueurs.
    if (!game.user?.isGM) return;

    for (const actor of game.actors ?? []) {
      if (isMonitoredActor(actor)) stateByActor.set(actor.id, snapshotActor(actor));
    }

    Hooks.on("updateActor", actor => {
      scheduleActorAnalysis(actor);
    });

    Hooks.on("createActiveEffect", effect => {
      scheduleEffectAnalysis(effect);
    });

    Hooks.on("updateActiveEffect", effect => {
      scheduleEffectAnalysis(effect);
    });

    Hooks.on("deleteActiveEffect", effect => {
      scheduleEffectAnalysis(effect);
    });

    Hooks.on("createActor", actor => {
      if (isMonitoredActor(actor)) stateByActor.set(actor.id, snapshotActor(actor));
    });

    Hooks.on("deleteActor", actor => {
      const pending = pendingByActor.get(actor.id);
      if (pending?.timer) clearTimeout(pending.timer);
      pendingByActor.delete(actor.id);
      stateByActor.delete(actor.id);
    });

    console.log("Evil Toolbox | Assistant MJ CoC7 actif");
  });
})();
