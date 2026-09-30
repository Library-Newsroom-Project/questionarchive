// Assignment Board — MVP
//
// Data source: the "Stories" tab of the Assignment Board Story Database
// sheet, published to the web as CSV (File → Share → Publish to web). Edits
// to the sheet show up here within about 5 minutes.
const PAGE_SIZE = 9;

const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTcgQJRIULIb8_9vVRh-FeYlZm-nRVRqjAOTU1vuEB7gk5s9OTPwcLcU5XryfshZcND7ZgrIl61a-Ca/pub?output=csv";

async function fetchStoriesCSV() {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Claim requests are emailed to the newsroom through Web3Forms
// (https://web3forms.com), so readers never leave the site. The recipient
// (hello@librarynewsroom.org) is set in the Web3Forms dashboard; the access
// key only sends there, so it's safe to keep in public code.
const WEB3FORMS_KEY = "19ed4b63-f26e-4b93-b3f7-b206edf2508b";
const CLAIM_ENDPOINT = "https://api.web3forms.com/submit";

// Plain-language answer to "what am I signing up for?", shown under the
// Claim button in the story pop-up and at the top of the claim form.
const CLAIM_NOTE = "We'll get in touch—you don't have to write anything yet.";

const CLAIM_ROLES = [
  "Write the story myself",
  "Co-write with a partner",
  "Research or interview only",
  "Take photos or video",
];
const CLAIM_EXPERIENCE = [
  "First time writing",
  "I've written a little",
  "I write regularly",
];
const CLAIM_TIMELINE = [
  "In the next 2 weeks",
  "Within a month",
  "I'm flexible",
];
const CLAIM_CONNECTION = [
  "I live in Sunset Park",
  "I work or study in Sunset Park",
  "It affects me or someone I know",
  "I'm just curious",
];

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

function cardInnerHTML(story, { showClaimNote = false } = {}) {
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
      ? `<div class="card-footer">
          <button type="button" class="claim-btn" data-id="${escapeHTML(story.id)}">I want to work on this</button>
          ${showClaimNote ? `<p class="claim-note">${CLAIM_NOTE}</p>` : ""}
        </div>`
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
  body.innerHTML = cardInnerHTML(story, { showClaimNote: true });
  overlay.hidden = false;
}

function closeModal() {
  document.getElementById("modal-overlay").hidden = true;
}

function radioGroup(name, options, required) {
  return options.map((opt, i) => `
    <label class="choice">
      <input type="radio" name="${name}" value="${escapeHTML(opt)}" ${required && i === 0 ? "required" : ""} />
      <span>${escapeHTML(opt)}</span>
    </label>`).join("");
}

function checkboxGroup(name, options) {
  return options.map((opt) => `
    <label class="choice">
      <input type="checkbox" name="${name}" value="${escapeHTML(opt)}" />
      <span>${escapeHTML(opt)}</span>
    </label>`).join("");
}

function claimFormHTML(story) {
  return `
    <form id="claim-form" class="claim-form" novalidate>
      <p class="claim-eyebrow">I want to work on this</p>
      <p class="claim-question">${escapeHTML(story.question)}</p>
      <p class="claim-note claim-form-note">${CLAIM_NOTE}</p>

      <div class="field">
        <label for="claim-name">Your name</label>
        <input id="claim-name" name="name" type="text" autocomplete="name" required />
      </div>

      <fieldset class="field">
        <legend>How can we reach you?</legend>
        <p class="field-hint">Leave an email, a phone number (or both). An editor will use it to follow up with you.</p>
        <div class="contact-row">
          <div>
            <label for="claim-email">Email</label>
            <input id="claim-email" name="email" type="email" autocomplete="email" />
          </div>
          <div>
            <label for="claim-phone">Phone</label>
            <input id="claim-phone" name="phone" type="tel" autocomplete="tel" />
          </div>
        </div>
      </fieldset>

      <fieldset class="field">
        <legend>How would you like to help?</legend>
        <div class="choices">${radioGroup("role", CLAIM_ROLES, true)}</div>
      </fieldset>

      <fieldset class="field">
        <legend>Writing experience</legend>
        <div class="choices">${radioGroup("experience", CLAIM_EXPERIENCE, false)}</div>
      </fieldset>

      <fieldset class="field">
        <legend>When could you work on it?</legend>
        <div class="choices">${radioGroup("timeline", CLAIM_TIMELINE, false)}</div>
      </fieldset>

      <fieldset class="field">
        <legend>Your connection to this question <span class="optional">(pick any)</span></legend>
        <div class="choices">${checkboxGroup("connection", CLAIM_CONNECTION)}</div>
      </fieldset>

      <div class="field">
        <label for="claim-notes">Notes <span class="optional">(optional)</span></label>
        <textarea id="claim-notes" name="notes" rows="3" placeholder="Anything else the editors should know?"></textarea>
      </div>

      <input type="text" name="_honey" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" />

      <p class="form-error" role="alert" hidden></p>

      <div class="form-actions">
        <button type="button" class="cancel-btn">Cancel</button>
        <button type="submit" class="claim-btn">Send</button>
      </div>
    </form>
  `;
}

// Stories claimed from this browser are remembered locally so the claimer
// sees them as "Claimed" right away. Everyone else sees the change once the
// story's state is updated in the sheet.
const CLAIMED_KEY = "claimedStoryIds";

function loadClaimedIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLAIMED_KEY)) || []);
  } catch {
    return new Set();
  }
}

function rememberClaim(id) {
  try {
    const ids = loadClaimedIds();
    ids.add(id);
    localStorage.setItem(CLAIMED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable (private mode etc.) — the claim still went out.
  }
}

function openClaimForm(story, onClaimed) {
  const overlay = document.getElementById("modal-overlay");
  const body = document.getElementById("modal-body");
  body.innerHTML = claimFormHTML(story);
  overlay.hidden = false;

  const form = body.querySelector("#claim-form");
  const errorEl = form.querySelector(".form-error");
  const submitBtn = form.querySelector('button[type="submit"]');

  form.querySelector(".cancel-btn").addEventListener("click", () => openModal(story));
  form.querySelector("#claim-name").focus();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const data = new FormData(form);
    const name = (data.get("name") || "").trim();
    const email = (data.get("email") || "").trim();
    const phone = (data.get("phone") || "").trim();
    const role = data.get("role");

    let problem = "";
    if (!name) problem = "Please enter your name.";
    else if (!email && !phone) problem = "Please leave an email or phone number so we can reach you.";
    else if (email && !form.querySelector("#claim-email").checkValidity()) problem = "That email address doesn't look right.";
    else if (!role) problem = "Please choose how you'd like to help.";
    if (problem) {
      errorEl.textContent = problem;
      errorEl.hidden = false;
      return;
    }

    const fields = {
      "Story ID": story.id,
      "Section": story.section,
      "Question": story.question,
      "Name": name,
      // Only list the contact details they left, so editors can reach back out.
      ...(email && { "Contact email": email }),
      ...(phone && { "Contact phone": phone }),
      "How they'd like to help": role,
      "Writing experience": data.get("experience") || "(not answered)",
      "Timeline": data.get("timeline") || "(not answered)",
      "Connection": data.getAll("connection").join(", ") || "(not answered)",
      "Notes": (data.get("notes") || "").trim() || "(none)",
    };
    const payload = new FormData();
    payload.append("access_key", WEB3FORMS_KEY);
    payload.append("subject", `Claiming: ${story.id} — ${name}`);
    payload.append("from_name", "Sunset Park Sun Assignment Board");
    // Only a bot fills the hidden honeypot; Web3Forms drops those as spam.
    if (data.get("_honey")) payload.append("botcheck", "on");
    if (email) payload.append("replyto", email);
    Object.entries(fields).forEach(([key, value]) => payload.append(key, value));

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";
    try {
      const res = await fetch(CLAIM_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: payload,
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        throw new Error(result.message || `HTTP ${res.status}`);
      }
      body.innerHTML = `
        <div class="claim-done">
          <p class="claim-eyebrow">Thanks, ${escapeHTML(name)}!</p>
          <p class="claim-question">${escapeHTML(story.question)}</p>
          <p class="description">Your claim was sent to the Library Newsroom team. An editor will follow up with you soon.</p>
          <div class="form-actions">
            <button type="button" class="claim-btn done-btn">Back to the board</button>
          </div>
        </div>
      `;
      body.querySelector(".done-btn").addEventListener("click", closeModal);
      if (onClaimed && !data.get("_honey")) onClaimed();
    } catch (err) {
      console.error("Claim submission failed:", err);
      errorEl.textContent = `Sorry, your claim couldn't be sent (${err.message}). Please try again in a moment.`;
      errorEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Send";
    }
  });
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
    const text = await fetchStoriesCSV();
    stories = parseCSV(text).map(toStory).filter((s) => s.question);
    const claimedIds = loadClaimedIds();
    stories.forEach((s) => {
      if (s.status === "Unclaimed" && claimedIds.has(s.id)) s.status = "Claimed";
    });
  } catch (err) {
    cardsEl.innerHTML = `<p class="empty">Couldn't load stories: ${err}</p>`;
    return;
  }

  populateFilter(statusEl, new Set(stories.map((s) => s.status)));
  populateFilter(sectionEl, new Set(stories.map((s) => s.section)));

  // Open on the stories people can act on; answered ones are one tap away.
  const shortcutEl = document.getElementById("status-shortcut");
  if (stories.some((s) => s.status === "Unclaimed")) statusEl.value = "Unclaimed";

  function updateShortcut() {
    const answered = stories.filter((s) => s.status === "Answered").length;
    if (statusEl.value === "Answered") {
      shortcutEl.textContent = "← Back to stories you can claim";
      shortcutEl.dataset.target = "Unclaimed";
    } else {
      shortcutEl.textContent = `See the ${answered} questions neighbors have already answered →`;
      shortcutEl.dataset.target = "Answered";
    }
    shortcutEl.hidden = answered === 0;
  }

  shortcutEl.addEventListener("click", () => {
    statusEl.value = shortcutEl.dataset.target;
    resetAndRender();
  });

  const pagerEl = document.getElementById("pager");
  let page = 1;

  function resetAndRender() {
    page = 1;
    render();
  }

  function renderPager(totalPages) {
    pagerEl.hidden = totalPages <= 1;
    if (totalPages <= 1) return;
    pagerEl.innerHTML = `
      <button type="button" class="pager-btn" data-dir="-1" ${page === 1 ? "disabled" : ""}>← Previous</button>
      <span class="pager-status">Page ${page} of ${totalPages}</span>
      <button type="button" class="pager-btn" data-dir="1" ${page === totalPages ? "disabled" : ""}>Next →</button>
    `;
  }

  pagerEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".pager-btn");
    if (!btn || btn.disabled) return;
    page += Number(btn.dataset.dir);
    render();
  });

  function markClaimed(story) {
    rememberClaim(story.id);
    story.status = "Claimed";
    render();
  }

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

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const start = (page - 1) * PAGE_SIZE;

    countEl.textContent = `${filtered.length} of ${stories.length} stories`;
    updateShortcut();
    renderPager(totalPages);
    cardsEl.innerHTML = "";
    if (filtered.length === 0) {
      cardsEl.innerHTML = `<p class="empty">No stories match.</p>`;
      return;
    }
    filtered.slice(start, start + PAGE_SIZE).forEach((s) => cardsEl.appendChild(renderCard(s)));
  }

  searchEl.addEventListener("input", resetAndRender);
  statusEl.addEventListener("change", resetAndRender);
  sectionEl.addEventListener("change", resetAndRender);

  const findStory = (id) => stories.find((s) => s.id === id);

  cardsEl.addEventListener("click", (e) => {
    const claimBtn = e.target.closest(".claim-btn");
    if (claimBtn) {
      const story = findStory(claimBtn.dataset.id);
      if (story) openClaimForm(story, () => markClaimed(story));
      return;
    }
    const card = e.target.closest(".card");
    if (!card) return;
    const story = findStory(card.dataset.id);
    if (story) openModal(story);
  });

  document.getElementById("modal-body").addEventListener("click", (e) => {
    const claimBtn = e.target.closest(".card-footer .claim-btn");
    if (!claimBtn) return;
    const story = findStory(claimBtn.dataset.id);
    if (story) openClaimForm(story, () => markClaimed(story));
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
