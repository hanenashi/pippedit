// ==UserScript==
// @name         PippEdit
// @namespace    https://github.com/hanenashi/pippedit
// @version      1.3.0
// @description  Freeform page painter for Piacere menus: Edit mode, Ditch! (red+strike), Green, Undo, line/paragraph ops. Ctrl/Cmd+E toggles.
// @match        https://www.piacere-pizza.com/*
// @icon         https://www.piacere-pizza.com/wp-content/uploads/2019/02/cropped-favicon_2019_512px-32x32.png
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/hanenashi/pippedit/main/pippedit.user.js
// @downloadURL  https://raw.githubusercontent.com/hanenashi/pippedit/main/pippedit.user.js
// @homepageURL  https://github.com/hanenashi/pippedit
// @supportURL   https://github.com/hanenashi/pippedit/issues
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const main =
    document.querySelector('.entry-content') ||
    document.querySelector('main') ||
    document.body;
  if (!main) return;

  // ---- styles ----
  const css = `
#ppp-toolbar{
  position:fixed; top:12px; right:12px; z-index:999999;
  font:13px/1.25 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  background:#111; color:#eee; border:1px solid #333; border-radius:12px; padding:10px; width:292px;
  box-shadow:0 8px 30px rgba(0,0,0,.4);
  display:block;
}
#ppp-toolbar .row{display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0}
#ppp-toolbar .btn{border:1px solid #404040; background:#1d1d1d; color:#eee; padding:6px 10px; border-radius:8px; cursor:pointer}
#ppp-toolbar .btn:hover{background:#2a2a2a}
#ppp-toolbar .sep{height:1px; background:#2a2a2a; margin:6px 0; width:100%}
#ppp-toolbar kbd{background:#222;border:1px solid #333;border-bottom-width:2px;padding:1px 5px;border-radius:6px;font-size:11px;color:#cbd5e1}
.ppp-editing{outline:2px dashed #0aa3 !important; outline-offset:6px !important; caret-color:#fff}
.ppp-no-nav a{pointer-events:none}
.ppp-ditch{color:#c00 !important; text-decoration:line-through !important}
.ppp-green{color:green !important; font-weight:bold !important}
  `;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ---- state & undo ----
  let editing = false;          // default OFF
  let originalHTML = '';
  const undoStack = [];
  const MAX_UNDO = 50;

  const sel = () => window.getSelection();
  const hasSelection = () => {
    const s = sel();
    return s && s.rangeCount && !s.getRangeAt(0).collapsed;
  };
  const getRange = () => (sel().rangeCount ? sel().getRangeAt(0) : null);

  const snapshot = () => {
    undoStack.push(main.innerHTML);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
  };
  const undo = () => {
    const last = undoStack.pop();
    if (last != null) main.innerHTML = last;
  };

  // ---- actions ----
  function wrapSelectionWithSpan(classNames) {
    const r = getRange();
    if (!r) return;
    const frag = r.cloneContents();
    if (!frag || !frag.childNodes.length) return;
    snapshot();
    const span = document.createElement('span');
    span.className = classNames.join(' ');
    span.appendChild(frag);
    r.deleteContents();
    r.insertNode(span);
    r.setStartAfter(span);
    r.setEndAfter(span);
    sel().removeAllRanges();
    sel().addRange(r);
  }

  function clearFormattingInSelection() {
    const r = getRange();
    if (!r) return;
    const container = r.commonAncestorContainer.nodeType === 1
      ? r.commonAncestorContainer
      : r.commonAncestorContainer.parentNode;
    const spans = Array.from(container.querySelectorAll('.ppp-ditch, .ppp-green'));
    let touched = false;
    const intersects = (el) => {
      const nr = document.createRange();
      nr.selectNodeContents(el);
      return (
        r.compareBoundaryPoints(Range.END_TO_START, nr) < 0 &&
        r.compareBoundaryPoints(Range.START_TO_END, nr) > 0
      );
    };
    spans.forEach(sp => {
      if (!intersects(sp)) return;
      if (!touched) snapshot();
      touched = true;
      while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp);
      sp.remove();
    });
  }

  function insertBR() {
    const r = getRange();
    if (!r) return;
    snapshot();
    r.deleteContents();
    const br = document.createElement('br');
    r.insertNode(br);
    r.setStartAfter(br);
    r.setEndAfter(br);
    sel().removeAllRanges();
    sel().addRange(r);
  }

  function insertParagraph() {
    const r = getRange();
    if (!r) return;
    snapshot();
    r.deleteContents();
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    r.insertNode(p);
    const nr = document.createRange();
    nr.selectNodeContents(p);
    nr.collapse(true);
    sel().removeAllRanges();
    sel().addRange(nr);
  }

  function duplicateSelection() {
    const r = getRange();
    if (!r) return;
    const frag = r.cloneContents();
    if (!frag || !frag.childNodes.length) return;
    snapshot();
    r.collapse(false);
    r.insertNode(frag);
  }

  function deleteSelection() {
    const r = getRange();
    if (!r || r.collapsed) return;
    snapshot();
    r.deleteContents();
  }

  // ---- edit mode ----
  function syncCheckbox() {
    const cb = document.getElementById('ppp-edit-toggle');
    if (cb) cb.checked = editing;
  }
  function toggleEdit(on) {
    editing = on ?? !editing;
    syncCheckbox();
    if (editing) {
      originalHTML = main.innerHTML; // start snapshot
      undoStack.length = 0;
      main.contentEditable = 'true';
      main.classList.add('ppp-editing');
      document.documentElement.classList.add('ppp-no-nav');
    } else {
      main.contentEditable = 'false';
      main.classList.remove('ppp-editing');
      document.documentElement.classList.remove('ppp-no-nav');
    }
  }
  function revertToSnapshot() {
    if (!originalHTML) return;
    main.innerHTML = originalHTML;
    undoStack.length = 0;
  }

  // ---- toolbar ----
  function makeToolbar() {
    const box = document.createElement('div');
    box.id = 'ppp-toolbar';
    box.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <strong>Page Painter</strong>
        <label><input id="ppp-edit-toggle" type="checkbox"/> Edit</label>
      </div>

      <div class="row">
        <button class="btn" id="ppp-ditch">Ditch!</button>
        <button class="btn" id="ppp-green">Green</button>
        <button class="btn" id="ppp-clear">Clear</button>
      </div>

      <div class="row">
        <button class="btn" id="ppp-br">Line break</button>
        <button class="btn" id="ppp-para">New paragraph</button>
      </div>

      <div class="row">
        <button class="btn" id="ppp-dup">Duplicate</button>
        <button class="btn" id="ppp-del">Delete</button>
      </div>

      <div class="sep"></div>

      <div class="row">
        <button class="btn" id="ppp-undo">Undo</button>
        <button class="btn" id="ppp-revert">Revert (since Edit)</button>
      </div>

      <div class="row" style="gap:6px;color:#9ad">
        <span><kbd>Ctrl/Cmd</kbd>+<kbd>E</kbd> Edit</span>
        <span><kbd>Ctrl/Cmd</kbd>+<kbd>D</kbd> Ditch</span>
        <span><kbd>Ctrl/Cmd</kbd>+<kbd>G</kbd> Green</span>
        <span><kbd>Ctrl/Cmd</kbd>+<kbd>0</kbd> Clear</span>
        <span><kbd>Ctrl/Cmd</kbd>+<kbd>Z</kbd> Undo</span>
        <span><kbd>Shift</kbd>+<kbd>Enter</kbd> BR</span>
      </div>
    `;
    box.querySelector('#ppp-edit-toggle').addEventListener('change', e => toggleEdit(e.target.checked));
    box.querySelector('#ppp-ditch').addEventListener('click', () => hasSelection() && wrapSelectionWithSpan(['ppp-ditch']));
    box.querySelector('#ppp-green').addEventListener('click', () => hasSelection() && wrapSelectionWithSpan(['ppp-green']));
    box.querySelector('#ppp-clear').addEventListener('click', clearFormattingInSelection);
    box.querySelector('#ppp-br').addEventListener('click', insertBR);
    box.querySelector('#ppp-para').addEventListener('click', insertParagraph);
    box.querySelector('#ppp-dup').addEventListener('click', duplicateSelection);
    box.querySelector('#ppp-del').addEventListener('click', deleteSelection);
    box.querySelector('#ppp-undo').addEventListener('click', undo);
    box.querySelector('#ppp-revert').addEventListener('click', revertToSnapshot);
    return box;
  }

  // ---- keyboard shortcuts ----
  document.addEventListener('keydown', (e) => {
    // Toggle edit: Ctrl+E / Cmd+E (no plain 'E' capture anymore)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'e') {
      toggleEdit();
      e.preventDefault(); // try to beat browser default
      return;
    }
    if (!editing) return;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'd') { if (hasSelection()) wrapSelectionWithSpan(['ppp-ditch']); e.preventDefault(); }
      else if (k === 'g') { if (hasSelection()) wrapSelectionWithSpan(['ppp-green']); e.preventDefault(); }
      else if (k === '0') { clearFormattingInSelection(); e.preventDefault(); }
      else if (k === 'z') { undo(); e.preventDefault(); }
    }
    if (e.shiftKey && e.key === 'Enter') { insertBR(); e.preventDefault(); }
  }, true);

  // block link nav while editing
  main.addEventListener('click', (e) => {
    if (!editing) return;
    const a = e.target.closest('a');
    if (a) e.preventDefault();
  }, true);

  // boot
  const bar = makeToolbar();
  document.body.appendChild(bar);
  toggleEdit(false);
})();
