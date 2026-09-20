// Assignment Board — MVP
//
// Data source: data/stories.csv, a copy of the "Assignment Board Story
// Database" sheet. When the live sheet is ready to be read directly
// (Phase 0 in the build roadmap), replace CSV_URL below with the sheet's
// published-CSV export URL — nothing else in this file needs to change.
const CSV_URL = "data/stories.csv";

// Claiming a story is a placeholder mailto: link until a real Google Form
// exists. Swap CLAIM_URL for the form's prefilled URL when it's ready.
function claimLink(story) {
  const subject = encodeURIComponent(`Claiming: ${story.id}`);
  const body = encodeURIComponent(
    `I'd like to claim this story question:\n\n"${story.question}"\n\nStory ID: ${story.id}`
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

// Minimal RFC 4180 CSV parser (handles quoted fields, embedded commas,
// escaped "" quotes, and newlines inside quoted fields).
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const header = rows[0];
  return rows.slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ""))
    .map((r) => {
      const obj = {};
      header.forEach((key, idx) => { obj[key] = (r[idx] || "").trim(); });
      return obj;
    });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function statusClass(status) {
  return "status-" + status.toLowerCase().replace(/\s+/g, "-");
}

function toStory(raw) {
  return {
    id: raw["Story ID"],
    section: raw["Section"],
    question: raw["Questions"],
    headline: raw["Story Headline (If published)"],
    description: raw["Story Description or Prompt"],
    status: raw["Story state"] || "Unclaimed",
  };
}

function cardInnerHTML(story) {
  const showHeadline = story.status === "Answered" && story.headline;
  return `
    <div class="card-tags">
      <span class="tag status ${statusClass(story.status)}">${escapeHTML(story.status)}</span>
      <span class="tag">${escapeHTML(story.section)}</span>
    </div>
    <button type="button" class="question" data-id="${escapeHTML(story.id)}">${escapeHTML(story.question)}</button>
    ${showHeadline ? `<p class="headline"><strong>Headline:</strong> ${escapeHTML(story.headline)}</p>` : ""}
    <p class="description">${escapeHTML(story.description)}</p>
    ${story.status === "Unclaimed"
      ? `<div class="card-footer"><a class="claim-btn" href="${claimLink(story)}">Claim this story</a></div>`
      : ""}
  `;
}

function renderCard(story) {
  const el = document.createElement("article");
  el.className = "card";
  el.dataset.id = story.id;
  el.innerHTML = cardInnerHTML(story);
  return el;
}

function populateFilter(select, values) {
  [...values].sort().forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

function openModal(story) {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  body.innerHTML = cardInnerHTML(story);
  overlay.hidden = false;
}

function closeModal() {
  document.getElementById("modal-overlay").hidden = true;
}

async function init() {
  const cardsEl = document.getElementById("cards");
  const countEl = document.getElementById("count");
  const searchEl = document.getElementById("search");
  const statusEl = document.getElementById("status-filter");
  const sectionEl = document.getElementById("section-filter");
  const overlayEl = document.getElementById("modal-overlay");

  let stories;
  try {
    const res = await fetch(CSV_URL);
    const text = await res.text();
    stories = parseCSV(text).map(toStory).filter((s) => s.question);
  } catch (err) {
    cardsEl.innerHTML = `<p class="empty">Couldn't load stories: ${err}</p>`;
    return;
  }

  populateFilter(statusEl, new Set(stories.map((s) => s.status)));
  populateFilter(sectionEl, new Set(stories.map((s) => s.section)));

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const status = statusEl.value;
    const section = sectionEl.value;

    const filtered = stories.filter((s) => {
      if (status && s.status !== status) return false;
      if (section && s.section !== section) return false;
      if (q && !s.question.toLowerCase().includes(q) && !s.headline.toLowerCase().includes(q)) return false;
      return true;
    });

    countEl.textContent = `${filtered.length} of ${stories.length} stories`;
    cardsEl.innerHTML = "";
    if (filtered.length === 0) {
      cardsEl.innerHTML = `<p class="empty">No stories match.</p>`;
      return;
    }
    filtered.forEach((s) => cardsEl.appendChild(renderCard(s)));
  }

  searchEl.addEventListener("input", render);
  statusEl.addEventListener("change", render);
  sectionEl.addEventListener("change", render);

  cardsEl.addEventListener("click", (e) => {
    if (e.target.closest(".claim-btn")) return;
    const card = e.target.closest(".card");
    if (!card) return;
    const story = stories.find((s) => s.id === card.dataset.id);
    if (story) openModal(story);
  });

  document.getElementById("modal-close").addEventListener("click", closeModal);
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlayEl.hidden) closeModal();
  });

  render();
}

init();
