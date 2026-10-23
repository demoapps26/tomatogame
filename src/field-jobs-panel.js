import {
  FIELD_JOBS_BOARD,
  getFieldJobsView,
  startFieldJob,
} from "./field-jobs.js";

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const money = (value) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
const clock = (value) => {
  const seconds = Math.max(0, Math.ceil(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
};

const PANEL_STYLE = `
#field-jobs-panel{position:absolute;inset:0;z-index:38;display:flex;align-items:center;justify-content:center;padding:clamp(12px,3vw,36px);background:rgba(13,27,23,.74);color:#243c30;font-family:inherit;overflow:hidden;overscroll-behavior:contain}
#field-jobs-panel[hidden]{display:none!important}
#field-jobs-panel *{box-sizing:border-box}
#field-jobs-panel button{font:inherit;cursor:pointer;letter-spacing:inherit}
#field-jobs-panel button:disabled{cursor:default;opacity:.46}
#field-jobs-panel button:focus-visible{outline:3px solid #c67c3f;outline-offset:3px}
#field-jobs-panel .fj-window{display:flex;flex-direction:column;width:min(1060px,100%);max-height:100%;background:#f5f0e4;border:1px solid #d3c5a9;border-radius:12px;box-shadow:0 30px 100px #06130e80;overflow:hidden}
#field-jobs-panel .fj-header{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:26px 30px 21px;border-bottom:1px solid #d8d0bd;background:linear-gradient(112deg,#f8f5ed,#e8e6d6)}
#field-jobs-panel .fj-eyebrow{display:block;font-size:10px;font-weight:750;letter-spacing:.16em;color:#69775c;text-transform:uppercase}
#field-jobs-panel h2{margin:7px 0 5px;font-size:clamp(24px,3vw,34px);line-height:1.13;letter-spacing:-.035em;color:#213e30}
#field-jobs-panel .fj-header p{margin:0;font-size:13px;line-height:1.6;color:#68705d;max-width:650px}
#field-jobs-panel .fj-close{flex:none;width:38px;height:38px;border:1px solid #c8c4b3;border-radius:50%;background:#faf7ef;font-size:26px;line-height:1;color:#385342}
#field-jobs-panel .fj-layout{display:grid;grid-template-columns:290px minmax(0,1fr);min-height:0;overflow:auto}
#field-jobs-panel .fj-list{padding:22px 18px;background:#e9e9dc;border-right:1px solid #d4d4c2;display:flex;flex-direction:column;gap:11px}
#field-jobs-panel .fj-list-note{font-size:11px;line-height:1.65;color:#69745e;margin:5px 5px 0}
#field-jobs-panel .fj-card{display:block;text-align:left;border:1px solid #ceceba;background:#f5f3e8;color:#2c4434;border-radius:7px;padding:16px 14px;width:100%}
#field-jobs-panel .fj-card[aria-pressed=true]{background:#294c3a;color:#faf6e9;border-color:#294c3a;box-shadow:inset 3px 0 #cfa66a}
#field-jobs-panel .fj-card-top{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.8}
#field-jobs-panel .fj-card strong{display:block;margin:10px 0 7px;font-size:17px;font-weight:700;letter-spacing:-.015em}
#field-jobs-panel .fj-card-meta{font-size:12px;opacity:.83}
#field-jobs-panel .fj-detail{padding:24px 30px 28px;min-width:0}
#field-jobs-panel .fj-feedback{margin:0 0 18px;padding:11px 14px;border-left:3px solid #b28248;background:#ece5d3;font-size:12px;line-height:1.6;color:#5d4a31}
#field-jobs-panel .fj-feedback:empty{display:none}
#field-jobs-panel .fj-active{background:#e2e9db;border:1px solid #bccbb3;border-radius:7px;padding:17px 18px;margin-bottom:22px}
#field-jobs-panel .fj-active-head{display:flex;justify-content:space-between;gap:12px;align-items:center}
#field-jobs-panel .fj-timer{font-variant-numeric:tabular-nums;font-size:23px;font-weight:750;color:#294c3a}
#field-jobs-panel .fj-active h3{font-size:18px;margin:10px 0 5px}
#field-jobs-panel .fj-active p{font-size:13px;line-height:1.7;margin:0 0 10px;color:#54654b}
#field-jobs-panel .fj-location{font-size:11px;letter-spacing:.02em;font-weight:700;color:#476347}
#field-jobs-panel .fj-story h3{font-size:25px;line-height:1.2;letter-spacing:-.025em;margin:8px 0 12px}
#field-jobs-panel .fj-story p{margin:0;color:#67715e;font-size:13px;line-height:1.85}
#field-jobs-panel .fj-stats{display:flex;gap:25px;flex-wrap:wrap;margin:21px 0;padding:14px 0;border-block:1px solid #d9d4c1}
#field-jobs-panel .fj-stats span{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#7c806a}
#field-jobs-panel .fj-stats strong{display:block;font-size:19px;line-height:1.4;margin-top:4px;font-variant-numeric:tabular-nums}
#field-jobs-panel .fj-route{list-style:none;padding:0;margin:17px 0 20px;display:grid;gap:0}
#field-jobs-panel .fj-route li{display:flex;gap:12px;align-items:flex-start;padding:9px 0;min-width:0}
#field-jobs-panel .fj-step-number{width:24px;height:24px;border:1px solid #c8cbb5;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;color:#6c795e}
#field-jobs-panel .fj-route li.is-done .fj-step-number{background:#527254;border-color:#527254;color:#fff}
#field-jobs-panel .fj-route li.is-current .fj-step-number{background:#b5844b;border-color:#b5844b;color:#fff}
#field-jobs-panel .fj-route strong{display:block;font-size:12px;line-height:1.5}
#field-jobs-panel .fj-route small{display:block;font-size:11px;color:#7a806b;line-height:1.6}
#field-jobs-panel .fj-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:15px}
#field-jobs-panel .fj-action{border:1px solid #2d503b;background:#2d503b;color:#fffdf5;padding:11px 15px;border-radius:5px;font-size:12px;font-weight:700;line-height:1.3;min-height:39px}
#field-jobs-panel .fj-action.secondary{background:transparent;color:#435d42;border-color:#b7bda5}
#field-jobs-panel .fj-action.quiet{background:transparent;color:#786950;border-color:transparent;padding-inline:5px}
#field-jobs-panel .fj-reason{font-size:12px;line-height:1.65;color:#77745c;margin:12px 0 0}
#field-jobs-panel .fj-completed{display:flex;gap:10px;align-items:center;border:1px solid #b6c4aa;background:#e5eadb;border-radius:5px;padding:13px 15px;color:#3d5d3d;font-size:13px;line-height:1.6}
#field-jobs-panel .fj-completed b{font-size:21px}
#field-jobs-panel .fj-footer{display:flex;justify-content:space-between;gap:12px;padding:14px 25px;border-top:1px solid #d4d2be;color:#7d806a;font-size:10px;line-height:1.6;letter-spacing:.025em}
@media(max-width:650px){#field-jobs-panel{padding:10px}#field-jobs-panel .fj-header{padding:21px 19px 17px;gap:10px}#field-jobs-panel .fj-header p{font-size:12px}#field-jobs-panel .fj-layout{display:block}#field-jobs-panel .fj-list{border-right:0;border-bottom:1px solid #d4d4c2;padding:14px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}#field-jobs-panel .fj-list-note{grid-column:1/-1;margin:1px 2px 0;font-size:10px}#field-jobs-panel .fj-card{padding:10px 8px;min-height:114px}#field-jobs-panel .fj-card strong{font-size:12px;line-height:1.35;margin:8px 0}#field-jobs-panel .fj-card-top{font-size:8px;letter-spacing:.025em;display:block}#field-jobs-panel .fj-card-top span+span{display:none}#field-jobs-panel .fj-card-meta{font-size:10px;line-height:1.5}#field-jobs-panel .fj-detail{padding:20px 18px 23px}#field-jobs-panel .fj-story h3{font-size:24px}#field-jobs-panel .fj-stats{gap:20px}#field-jobs-panel .fj-footer{padding:12px 17px;font-size:9px}#field-jobs-panel .fj-footer span:first-child{max-width:55%}#field-jobs-panel .fj-actions .fj-action{flex:1 1 auto}#field-jobs-panel .fj-active{padding:14px}}
@media(prefers-reduced-motion:reduce){#field-jobs-panel *{scroll-behavior:auto}}
`;

/** A journal for accepting work, never a substitute for physical E interactions. */
export function createFieldJobsPanel({
  getState,
  getWorld,
  getContext,
  onStart,
  onCancel,
  onTrack,
  onStateChange,
  notify,
}) {
  let opened = false,
    disposed = false,
    selectedId = null,
    message = "",
    previousFocus = null;
  const style = document.createElement("style");
  style.dataset.fieldJobsStyle = "true";
  style.textContent = PANEL_STYLE;
  document.head.append(style);
  const panel = document.createElement("section");
  panel.id = "field-jobs-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "field-jobs-title");
  panel.innerHTML = `<div class="fj-window"><header class="fj-header"><div><span class="fj-eyebrow">O caderno de Anselmo · Santa Tomata</span><h2 id="field-jobs-title">Trabalhos da quinta.</h2><p>Há uma história em cada entrega. Vai ao terreno, conhece a cidade e faz crescer o nome da quinta.</p></div><button class="fj-close" type="button" data-field-action="close" aria-label="Fechar trabalhos e voltar à cidade">×</button></header><div class="fj-layout"><nav class="fj-list" aria-label="Trabalhos disponíveis"></nav><div class="fj-detail"><p class="fj-feedback" role="status" aria-live="polite"></p><div class="fj-body"></div></div></div><footer class="fj-footer"><span>Recolhe e entrega no local com E. Cada trabalho paga uma vez.</span><span>J / Esc · Voltar à cidade</span></footer></div>`;
  (document.getElementById("arena") || document.body).append(panel);
  const $ = (selector) => panel.querySelector(selector);
  const button = (
    label,
    action,
    { id = "", disabled = false, kind = "" } = {},
  ) =>
    `<button type="button" class="fj-action ${kind}" data-field-action="${action}"${id ? ` data-job-id="${escape(id)}"` : ""}${disabled ? " disabled" : ""}>${escape(label)}</button>`;
  const context = () => getContext?.() || {};

  function route(job, active) {
    return `<ol class="fj-route" aria-label="Etapas do trabalho">${job.steps
      .map((item, index) => {
        const completed =
          job.completed ||
          (active?.jobId === job.id && index < active.stepIndex);
        const current = active?.jobId === job.id && index === active.stepIndex;
        return `<li class="${completed ? "is-done" : current ? "is-current" : ""}"><span class="fj-step-number" aria-label="${completed ? "Concluída" : `Etapa ${index + 1}`}">${completed ? "✓" : index + 1}</span><div><strong>${escape(item.title)}</strong><small>${escape(item.point.label)} · ${item.requiresVehicle ? "ao volante" : "a pé"}</small></div></li>`;
      })
      .join("")}</ol>`;
  }

  function activeObjective(active) {
    if (!active) return "";
    return `<article class="fj-active" aria-label="Objetivo atual"><div class="fj-active-head"><span class="fj-eyebrow">Em curso · Etapa ${active.stepIndex + 1} / ${active.stepCount}</span><strong class="fj-timer" aria-label="Tempo restante">${clock(active.remaining)}</strong></div><h3>${escape(active.stepTitle)}</h3><p>${escape(active.description)}</p><span class="fj-location">${escape(active.point.label)} · E ${active.requiresVehicle ? "ao volante" : "a pé"}</span><div class="fj-actions">${button("Seguir objetivo", "track-objective", { disabled: !onTrack || context().mapId !== "cidade" })}${button("Voltar à cidade", "close", { kind: "secondary" })}${button("Cancelar trabalho", "cancel", { kind: "quiet", disabled: !onCancel })}</div></article>`;
  }

  function renderDetail(view) {
    const job =
      view.jobs.find((item) => item.id === selectedId) || view.jobs[0];
    if (!job) return activeObjective(view.active);
    const candidate = startFieldJob(getState?.(), job.id, context());
    let controls;
    if (job.completed)
      controls = `<div class="fj-completed"><b aria-hidden="true">✓</b><span>Trabalho concluído. Recompensa de ${money(job.reward)} já recebida e guardada.</span></div>`;
    else if (view.active)
      controls =
        view.active.jobId === job.id
          ? ""
          : `<p class="fj-reason">Termina ou cancela o trabalho atual antes de aceitar outra encomenda.</p>`;
    else
      controls = `<div class="fj-actions">${button(`Aceitar trabalho · ${money(job.reward)}`, "start", { id: job.id, disabled: !candidate.ok || !onStart })}${button("Ir ao quadro da quinta", "track-board", { kind: "secondary", disabled: !onTrack || context().mapId !== "cidade" })}</div><p class="fj-reason">${escape(candidate.ok ? "Estás junto ao quadro. Aceita o trabalho, regressa à cidade e carrega em E para recolher o material." : candidate.message)}</p>`;
    return `${activeObjective(view.active)}<article class="fj-story"><span class="fj-eyebrow">${escape(job.contact)}</span><h3>${escape(job.title)}</h3><p>${escape(job.description)}</p><div class="fj-stats"><div><span>Recompensa única</span><strong>${money(job.reward)}</strong></div><div><span>Prazo</span><strong>${clock(job.timeLimit)}</strong></div><div><span>Percurso</span><strong>${job.stepCount} etapas</strong></div></div>${route(job, view.active)}${controls}</article>`;
  }

  function refresh() {
    if (disposed || !opened) return false;
    const view = getFieldJobsView(getState?.(), getWorld?.());
    if (!view.jobs.some((item) => item.id === selectedId))
      selectedId =
        view.active?.jobId ||
        view.jobs.find((item) => !item.completed)?.id ||
        view.jobs[0]?.id;
    const focused = panel.contains(document.activeElement)
      ? {
          action: document.activeElement.dataset?.fieldAction,
          id: document.activeElement.dataset?.jobId || "",
        }
      : null;
    $(".fj-list").innerHTML =
      `${view.jobs.map((job, index) => `<button type="button" class="fj-card" data-field-action="select" data-job-id="${escape(job.id)}" aria-pressed="${job.id === selectedId}"><span class="fj-card-top"><span>${job.completed ? "✓ Concluído" : job.status === "active" ? "Em curso" : `Trabalho 0${index + 1}`}</span><span>${job.completed ? "Pago" : escape(job.difficulty)}</span></span><strong>${escape(job.title)}</strong><span class="fj-card-meta">${money(job.reward)} · ${clock(job.timeLimit)}</span></button>`).join("")}<p class="fj-list-note">${view.jobs.filter((item) => item.completed).length} / ${view.jobs.length} histórias concluídas. Aceita os trabalhos a pé no quadro junto à sede.</p>`;
    $(".fj-body").innerHTML = renderDetail(view);
    $(".fj-feedback").textContent = message;
    if (focused?.action) {
      const replacement = [
        ...panel.querySelectorAll("[data-field-action]"),
      ].find(
        (element) =>
          element.dataset.fieldAction === focused.action &&
          (element.dataset.jobId || "") === focused.id &&
          !element.disabled,
      );
      (replacement || $(".fj-close")).focus({ preventScroll: true });
    }
    return true;
  }

  function open(target = null) {
    if (disposed) return false;
    if (typeof target === "string") selectedId = target;
    if (opened) {
      refresh();
      return true;
    }
    previousFocus = document.activeElement;
    opened = true;
    message = "";
    panel.hidden = false;
    onStateChange?.(true);
    refresh();
    $(".fj-layout").scrollTop = 0;
    $(".fj-close").focus({ preventScroll: true });
    return true;
  }

  function close() {
    if (!opened) return false;
    opened = false;
    panel.hidden = true;
    onStateChange?.(false);
    const target =
      previousFocus?.isConnected &&
      !panel.contains(previousFocus) &&
      !previousFocus.closest?.("[hidden], [inert]") &&
      previousFocus.getClientRects?.().length
        ? previousFocus
        : document.getElementById("view") || document.getElementById("arena");
    if (target) {
      if (!target.hasAttribute("tabindex") && target.tabIndex < 0)
        target.tabIndex = -1;
      target.focus?.({ preventScroll: true });
    }
    previousFocus = null;
    return true;
  }

  function showResult(command, fallback) {
    message = command?.message || fallback;
    if (command?.ok !== true) notify?.(message);
    refresh();
  }

  function onClick(event) {
    if (!opened || disposed) return;
    const target = event.target.closest?.("[data-field-action]");
    if (!target || !panel.contains(target) || target.disabled) return;
    const action = target.dataset.fieldAction;
    if (action === "close") close();
    else if (action === "select") {
      selectedId = target.dataset.jobId;
      message = "";
      refresh();
    } else if (action === "track-board" || action === "track-objective") {
      const view = getFieldJobsView(getState?.(), getWorld?.());
      const point =
        action === "track-board" ? FIELD_JOBS_BOARD : view.active?.point;
      if (point && onTrack && context().mapId === "cidade") {
        close();
        onTrack({ ...point });
      }
    } else if (action === "start") {
      // Recheck position at the instant of acceptance; a stale open panel is
      // never authority to begin work from another part of the city.
      const candidate = startFieldJob(
        getState?.(),
        target.dataset.jobId,
        context(),
      );
      if (!candidate.ok) {
        showResult(candidate, "Aproxima-te do quadro da quinta.");
        return;
      }
      const command = onStart?.(target.dataset.jobId);
      if (command?.ok === true) close();
      else
        showResult(
          command,
          "Não foi possível aceitar o trabalho. Tenta novamente junto ao quadro.",
        );
    } else if (action === "cancel") {
      const command = onCancel?.();
      showResult(
        command,
        command?.ok === true
          ? "Trabalho cancelado."
          : "Não foi possível cancelar o trabalho.",
      );
    }
  }

  function onKeyDown(event) {
    if (!opened || disposed) return;
    const typing = event.target?.closest?.(
      "input, textarea, select, [contenteditable=true]",
    );
    if (event.key === "Escape" || (event.code === "KeyJ" && !typing)) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      const controls = [
        ...panel.querySelectorAll(
          "button:not(:disabled), [href], [tabindex='0']",
        ),
      ].filter((element) => element.getClientRects().length);
      const first = controls[0],
        last = controls.at(-1);
      if (
        first &&
        ((event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last))
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
    // Movement, shooting and other game shortcuts stay outside an open journal.
    event.stopPropagation();
  }

  function dispose() {
    if (disposed) return;
    close();
    disposed = true;
    panel.removeEventListener("click", onClick);
    panel.removeEventListener("keydown", onKeyDown);
    panel.remove();
    style.remove();
  }

  panel.addEventListener("click", onClick);
  panel.addEventListener("keydown", onKeyDown);
  return { open, close, isOpen: () => opened, refresh, dispose };
}
