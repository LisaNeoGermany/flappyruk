const MODULE_ID = "flappyruk";

Hooks.once("init", async () => {
  game.settings.register(MODULE_ID, "leaderboard", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
});

Hooks.once("ready", () => {
  try {
    game.settings.register("flappyruk", "leaderboard", {
      scope: "world",
      config: false,
      type: Array,
      default: []
    });
  } catch (e) {}

  // Socket relay
  game.socket.on(`module.${MODULE_ID}`, async (data) => {
    if (!data || !data.type) return;

    if (data.type === "submitScore" && game.user.isGM) {
      await saveScore(data.payload, data.requestId);
      if (data.senderId && data.requestId) {
        game.socket.emit(`module.${MODULE_ID}`, {
          type: "ackSubmit",
          requestId: data.requestId,
          to: data.senderId
        });
      }
    }

    if (data.type === "ackSubmit") {
      if (data.to && data.to !== game.user.id) return;
      Hooks.callAll(`${MODULE_ID}:ackSubmit`, data);
    }

    if (data.type === "leaderboardUpdated") {
      Hooks.callAll(`${MODULE_ID}:leaderboardUpdated`);
    }

    if (data.type === "clearBestScore") {
      Hooks.callAll(`${MODULE_ID}:clearBestScore`);
    }
  });

  // Chat fallback listener for GMs
  Hooks.on("createChatMessage", async (msg) => {
    try {
      const flag = msg.getFlag(MODULE_ID, "score");
      if (!flag) return;
      if (!game.user.isGM) return;
      await saveScore(flag.payload, flag.requestId);
      msg.delete?.();
    } catch (e) {
      console.error(`[${MODULE_ID}] GM chat relay failed`, e);
    }
  });

  async function saveScore(payload, requestId) {
    try {
      const current = game.settings.get(MODULE_ID, "leaderboard") ?? [];
      if (requestId && current.some(e => e.rid === requestId)) return;
      current.push({
        rid: requestId ?? null,
        actorId: payload.actorId ?? null,
        name: payload.name,
        img: payload.img,
        score: payload.score,
        ts: Date.now()
      });
      current.sort((a, b) => b.score - a.score);
      await game.settings.set(MODULE_ID, "leaderboard", current.slice(0, 15));
      game.socket.emit(`module.${MODULE_ID}`, { type: "leaderboardUpdated" });
    } catch (err) {
      console.error(`[${MODULE_ID}] GM failed to store score`, err);
    }
  }
});

// Expose API safely after all modules are ready
Hooks.once("ready", () => {
  const mod = game?.modules?.get(MODULE_ID);
  if (!mod) return;
  mod.api = Object.assign(mod.api ?? {}, {
    open: (opts = {}) => {
      const app = new FlappyRukApp(opts);
      app.render(true);
      return app;
    }
  });
});
