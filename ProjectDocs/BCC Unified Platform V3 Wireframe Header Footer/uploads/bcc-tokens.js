// bcc-tokens.js — BCC Design System CSS injection (plain JS, no JSX)
(function () {
  const css = `
    :root {
      --bg:      #0B0B0E;
      --bg-2:    #101014;
      --surface: #15151C;
      --surface-2: #1E1E28;
      --border:  rgba(255,255,255,0.07);
      --border-md: rgba(255,255,255,0.12);
      --border-strong: rgba(255,255,255,0.20);
      --text:    #F0EFF6;
      --text-2:  #8A899E;
      --text-3:  #52516A;
      --amber:        #F5A82A;
      --amber-dim:    #C4851F;
      --amber-muted:  rgba(245,168,42,0.10);
      --amber-glow:   rgba(245,168,42,0.20);
      --cyan:         #00C8E8;
      --cyan-dim:     #009DB8;
      --cyan-muted:   rgba(0,200,232,0.10);
      --cyan-glow:    rgba(0,200,232,0.18);
      --iris-orange:  #E8622D;
      --iris-teal:    #00B4C8;
      --iris-magenta: #E4007F;
      --iris-amber:   #F9B72B;
      --iris-olive:   #8CB43A;
      --font-display: 'Outfit', sans-serif;
      --font-body:    'Inter', sans-serif;
      --r:    8px;
      --r-md: 12px;
      --r-lg: 16px;
      --r-xl: 24px;
      --nav-h: 68px;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; font-size: 16px; }
    body {
      background: var(--bg); color: var(--text);
      font-family: var(--font-body); line-height: 1.6;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    h1,h2,h3,h4,h5,h6 {
      font-family: var(--font-display); font-weight: 700;
      line-height: 1.1; letter-spacing: -0.025em;
    }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; display: block; }
    button { cursor: pointer; font-family: var(--font-body); }
    input, textarea, select { font-family: var(--font-body); }

    ::-webkit-scrollbar { width: 5px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--surface-2); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--amber); }
    ::selection { background: var(--amber); color: #0B0B0E; }

    @keyframes spin        { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
    @keyframes spinReverse { from { transform: rotate(0deg); }   to { transform: rotate(-360deg); } }
    @keyframes fadeUp      { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
    @keyframes fadeIn      { from { opacity:0; }                             to { opacity:1; } }
    @keyframes shimmer     { 0%,100% { opacity:.5; } 50% { opacity:.9; } }
    @keyframes linePulse   { 0%,100% { opacity:.3; } 50% { opacity:.8; } }

    /* Viewfinder crop-mark corners (used on hover) */
    .vf-corner {
      position: absolute;
      width: 18px; height: 18px;
      border-style: solid;
      border-color: rgba(255,255,255,0.72);
      opacity: 0;
      transition: opacity 0.22s ease;
      pointer-events: none;
      z-index: 5;
    }
    .vf-tl { top:10px;    left:10px;    border-width: 1.5px 0 0 1.5px; }
    .vf-tr { top:10px;    right:10px;   border-width: 1.5px 1.5px 0 0; }
    .vf-br { bottom:10px; right:10px;   border-width: 0 1.5px 1.5px 0; }
    .vf-bl { bottom:10px; left:10px;    border-width: 0 0 1.5px 1.5px; }

    /* Page entrance — transform only so content is always visible even in background tabs */
    @keyframes slideUp { from { transform: translateY(14px); } to { transform: translateY(0); } }
    .page-enter { animation: slideUp 0.4s cubic-bezier(0.22,0.61,0.36,1) both; }

    /* Focus highlight for form elements */
    .bcc-input:focus {
      border-color: var(--amber) !important;
      box-shadow: 0 0 0 3px var(--amber-muted) !important;
    }
  `;
  const el = document.createElement('style');
  el.id = 'bcc-design-tokens';
  el.textContent = css;
  document.head.insertBefore(el, document.head.firstChild);
})();
