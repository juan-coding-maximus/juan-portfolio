/* El Departamento · demo access gate
   Client-side preview lock. Not real security (a determined visitor can read
   the source), it just keeps the demo from being casually public while the
   rebrand is private. Password is never stored in plaintext: we compare the
   SHA-256 of what the visitor types against the digest below.
   Password: investegas */
(function () {
  var DIGEST = "0b262c8a2a303fb2a09477ca9fd813237f2f7fc06dc171926d3416e9ee513c36";
  var KEY = "ed_demo_unlocked";

  // already unlocked this session -> do nothing
  try { if (sessionStorage.getItem(KEY) === "1") return; } catch (e) {}

  // Hide the page immediately, while the <head> is still parsing, so content
  // never flashes before the lock screen mounts.
  var hideStyle = document.createElement("style");
  hideStyle.id = "ed-gate-hide";
  hideStyle.textContent = "body>*:not(#ed-gate){filter:blur(14px);pointer-events:none;user-select:none}";
  (document.head || document.documentElement).appendChild(hideStyle);

  var GATE_CSS = "" +
    "#ed-gate{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;" +
    "background:#14213D;color:#FAF8F4;font-family:'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}" +
    "#ed-gate .box{width:min(420px,88vw);text-align:center;padding:0 24px}" +
    "#ed-gate .lock{width:34px;height:34px;margin:0 auto 26px;opacity:.85}" +
    "#ed-gate .lk{font-family:'Fraunces',Georgia,serif;font-weight:600;font-size:22px;letter-spacing:-.01em}" +
    "#ed-gate .lk b{color:#C77D02}" +
    "#ed-gate .eb{font-family:'Inter',sans-serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#8893ad;margin:30px 0 14px}" +
    "#ed-gate h1{font-family:'Fraunces',Georgia,serif;font-weight:500;font-size:clamp(26px,5vw,34px);line-height:1.08;letter-spacing:-.02em;margin-bottom:10px}" +
    "#ed-gate p{font-size:14.5px;color:#aab0c2;line-height:1.5;margin-bottom:28px}" +
    "#ed-gate form{display:flex;gap:10px}" +
    "#ed-gate input{flex:1;background:rgba(255,255,255,.06);border:1px solid #2d3a57;border-radius:5px;" +
    "padding:14px 16px;color:#fff;font-size:15px;font-family:inherit;outline:none;transition:border-color .2s}" +
    "#ed-gate input:focus{border-color:#C77D02}" +
    "#ed-gate input::placeholder{color:#6c7691}" +
    "#ed-gate button{background:#C77D02;color:#fff;border:none;border-radius:5px;padding:0 22px;font-size:15px;" +
    "font-weight:600;font-family:inherit;cursor:pointer;transition:background .2s}" +
    "#ed-gate button:hover{background:#A9690A}" +
    "#ed-gate .err{min-height:20px;margin-top:14px;font-size:13px;color:#E8896A;opacity:0;transition:opacity .2s}" +
    "#ed-gate .err.on{opacity:1}" +
    "#ed-gate .shake{animation:edshake .4s}" +
    "@keyframes edshake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}";

  function buildGate() {
    var css = document.createElement("style");
    css.textContent = GATE_CSS;
    document.head.appendChild(css);

    var gate = document.createElement("div");
    gate.id = "ed-gate";
    gate.innerHTML =
      '<div class="box">' +
        '<svg class="lock" viewBox="0 0 24 24" fill="none" stroke="#C77D02" stroke-width="1.6">' +
          '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>' +
        '<div class="lk">El Departamento<b>.</b></div>' +
        '<div class="eb" style="visibility:hidden" aria-hidden="true">Acceso privado</div>' +
        '<form id="ed-gate-form" autocomplete="off">' +
          '<input id="ed-gate-input" type="password" placeholder="¿Qué somos?" aria-label="¿Qué somos?" autofocus>' +
          '<button type="submit">Entrar</button>' +
        '</form>' +
        '<div class="err" id="ed-gate-err">Clave incorrecta. Inténtalo de nuevo.</div>' +
      '</div>';
    document.body.appendChild(gate);

    var form = document.getElementById("ed-gate-form");
    var input = document.getElementById("ed-gate-input");
    var err = document.getElementById("ed-gate-err");
    var box = gate.querySelector(".box");
    input.focus();

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var val = (input.value || "").trim().toLowerCase();
      sha256(val).then(function (hex) {
        if (hex === DIGEST) {
          try { sessionStorage.setItem(KEY, "1"); } catch (e) {}
          var hs = document.getElementById("ed-gate-hide");
          if (hs) hs.remove();
          gate.remove();
        } else {
          err.classList.add("on");
          box.classList.remove("shake"); void box.offsetWidth; box.classList.add("shake");
          input.value = ""; input.focus();
        }
      });
    });
  }

  function sha256(str) {
    var enc = new TextEncoder().encode(str);
    if (window.crypto && window.crypto.subtle) {
      return window.crypto.subtle.digest("SHA-256", enc).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ("0" + b.toString(16)).slice(-2);
        }).join("");
      });
    }
    return Promise.resolve(""); // no subtle crypto (e.g. plain http on some browsers): fail closed
  }

  if (document.body) buildGate();
  else document.addEventListener("DOMContentLoaded", buildGate);
})();
