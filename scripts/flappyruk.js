const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class FlappyRukApp extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "flappyruk-app",
    classes: ["flappyruk-app"],
    tag: "div",
    window: {
      title: "FLAPPYRUK.Title",
      icon: "fas fa-crow",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 560,
      height: 900
    },
    actions: {
      startGame: FlappyRukApp.#onStartGame,
      clearLeaderboard: FlappyRukApp.#onClearLeaderboard
    }
  };

  static PARTS = {
    main: {
      template: "modules/flappyruk/templates/app.hbs"
    }
  };

  #gameStarted = false;
  #onMsg = null;
  #onLB = null;
  #onClearBest = null;

  async _prepareContext(options) {
    const sel = canvas?.tokens?.controlled?.[0];
    const tokSrc = sel?.document?.texture?.src ?? game.user?.character?.prototypeToken?.texture?.src ?? "";
    const abs = tokSrc ? new URL(tokSrc, window.location.origin).href : "";

    return {
      query: abs ? `?token=${encodeURIComponent(abs)}` : "",
      isGM: game.user.isGM,
      gameStarted: this.#gameStarted,
      leaderboard: _safeGetLeaderboard()
    };
  }

  _onRender(context, options) {
    // Clean up old listeners to prevent duplicates on re-renders
    if (this.#onMsg) window.removeEventListener("message", this.#onMsg);
    if (this.#onLB) Hooks.off("flappyruk:leaderboardUpdated", this.#onLB);
    if (this.#onClearBest) Hooks.off("flappyruk:clearBestScore", this.#onClearBest);

    this.#renderLeaderboard();

    // Message listener for score submission and game over
    this.#onMsg = async (ev) => {
      const d = ev.data || {};
      if (d?.type === "fruk:score") {
        const payload = await this.#buildPayload(d.score);
        this.#submitScore(payload);
      } else if (d?.type === "fruk:gameover") {
        // Return to main menu after game over
        this.#gameStarted = false;
        this.render({ parts: ["main"] });
      }
    };
    window.addEventListener("message", this.#onMsg);

    // Leaderboard update listener
    this.#onLB = () => this.#renderLeaderboard();
    Hooks.on("flappyruk:leaderboardUpdated", this.#onLB);

    // Clear best score listener
    this.#onClearBest = () => {
      const iframe = this.element.querySelector("iframe");
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: "fruk:clearBest" }, "*");
      }
    };
    Hooks.on("flappyruk:clearBestScore", this.#onClearBest);
  }

  _onClose(options) {
    if (this.#onMsg) window.removeEventListener("message", this.#onMsg);
    if (this.#onLB) Hooks.off("flappyruk:leaderboardUpdated", this.#onLB);
    if (this.#onClearBest) Hooks.off("flappyruk:clearBestScore", this.#onClearBest);
  }

  static #onStartGame(event, target) {
    this.#gameStarted = true;
    this.render({ parts: ["main"] });
  }

  static async #onClearLeaderboard(event, target) {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("FLAPPYRUK.GMOnly"));
      return;
    }

    const confirm = await foundry.applications.api.DialogV2.confirm({
      window: {
        title: game.i18n.localize("FLAPPYRUK.ConfirmClearTitle")
      },
      content: `<p>${game.i18n.localize("FLAPPYRUK.ConfirmClear")}</p>`,
      yes: {
        label: game.i18n.localize("FLAPPYRUK.Delete"),
        icon: "fas fa-trash"
      },
      no: {
        label: game.i18n.localize("FLAPPYRUK.Cancel"),
        icon: "fas fa-times"
      },
      rejectClose: false
    });

    if (confirm) {
      await game.settings.set("flappyruk", "leaderboard", []);
      game.socket.emit("module.flappyruk", { type: "leaderboardUpdated" });

      // Notify all clients to clear best score
      game.socket.emit("module.flappyruk", { type: "clearBestScore" });
      // Also clear locally
      Hooks.callAll("flappyruk:clearBestScore");

      ui.notifications.info(game.i18n.localize("FLAPPYRUK.LeaderboardCleared"));
    }
  }

  async #buildPayload(score) {
    const sel = canvas?.tokens?.controlled?.[0];
    let img, name, actorId;
    if (sel) {
      img = sel.document.texture.src;
      name = sel.name;
      actorId = sel.actor?.id ?? null;
    } else if (game.user?.character) {
      img = game.user.character.prototypeToken.texture.src;
      name = game.user.character.name;
      actorId = game.user.character.id;
    } else {
      img = "icons/svg/mystery-man.svg";
      name = game.user?.name ?? "Player";
      actorId = null;
    }
    return { img, name, actorId, score };
  }

  async #submitScore(payload) {
    const requestId = foundry.utils.randomID();

    // If GM, save directly (socket doesn't send back to self)
    if (game.user.isGM) {
      try {
        const current = game.settings.get("flappyruk", "leaderboard") ?? [];
        if (requestId && current.some(e => e.rid === requestId)) return;
        current.push({
          rid: requestId,
          actorId: payload.actorId ?? null,
          name: payload.name,
          img: payload.img,
          score: payload.score,
          ts: Date.now()
        });
        current.sort((a, b) => b.score - a.score);
        await game.settings.set("flappyruk", "leaderboard", current.slice(0, 15));
        game.socket.emit("module.flappyruk", { type: "leaderboardUpdated" });
        // Update local leaderboard directly instead of using global hook
        this.#renderLeaderboard();
      } catch (err) {
        console.error("[flappyruk] GM failed to store score", err);
      }
      return;
    }

    // Non-GM: send via socket
    const waitAck = new Promise((resolve) => {
      const onAck = (d) => {
        if (d.requestId === requestId) {
          Hooks.off("flappyruk:ackSubmit", onAck);
          resolve(true);
        }
      };
      Hooks.on("flappyruk:ackSubmit", onAck);
      game.socket.emit("module.flappyruk", {
        type: "submitScore",
        payload,
        senderId: game.user.id,
        requestId
      });
      setTimeout(() => {
        Hooks.off("flappyruk:ackSubmit", onAck);
        resolve(false);
      }, 2500);
    });

    const ok = await waitAck;
    if (ok) return;

    // Chat fallback for non-GMs
    try {
      const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
      await ChatMessage.create({
        speaker: { alias: "FlappyRuk" },
        content: `<span style="display:none">score</span>`,
        whisper: gmIds,
        flags: { flappyruk: { score: { payload, requestId } } }
      }, { chatBubble: false });
    } catch (e) {
      console.error("[flappyruk] Chat fallback failed", e);
    }
  }

  #renderLeaderboard() {
    try {
      const list = this.element.querySelector("#fruk-leaderboard");
      if (!list) return;

      const data = _safeGetLeaderboard().slice(0, 3);
      const rows = data.map((e, idx) => {
        const safe = (String(e.name || ""))
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
        const img = e.img || "icons/svg/mystery-man.svg";
        return `<div class="cc-row">
          <div class="cc-rank">${idx + 1}</div>
          <img class="cc-avatar" src="${img}"/>
          <div class="cc-name">${safe}</div>
          <div class="cc-score">${e.score}</div>
        </div>`;
      }).join("") || `<div class="cc-empty">${game.i18n.localize("FLAPPYRUK.NoEntries")}</div>`;

      list.innerHTML = rows;
    } catch (e) {
      console.error("[flappyruk] render leaderboard failed", e);
    }
  }
}

/** Fallback getter that registers the leaderboard setting if missing. */
function _safeGetLeaderboard() {
  try {
    if (!game.settings.settings.has("flappyruk.leaderboard")) {
      game.settings.register("flappyruk", "leaderboard", {
        scope: "world",
        config: false,
        type: Array,
        default: []
      });
    }
    return game.settings.get("flappyruk", "leaderboard") ?? [];
  } catch (e) {
    console.error("[flappyruk] get leaderboard failed", e);
    return [];
  }
}

// Make class available across ES modules
try {
  globalThis.FlappyRukApp = FlappyRukApp;
} catch (e) {}

// Expose API
Hooks.once("init", () => {
  const mod = game.modules.get("flappyruk");
  if (mod) {
    mod.api = Object.assign(mod.api ?? {}, {
      open: () => {
        const app = new FlappyRukApp();
        app.render(true);
        return app;
      }
    });
  }
});
