const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const FALLBACKS = [
  { title: "The lamp is still warm", body: "Someone left the room mid-sentence. The hour keeps the place until a public note arrives." },
  { title: "A window left an inch", body: "Street noise comes in like a polite guest. Nothing here is in a rush." },
  { title: "Paper that remembers", body: "Private notes stay on a desk. Public ones wait their turn on the wall." },
];

const state = {
  user: null,
  profile: null,
  signup: false,
  publicNotes: [],
};

const $ = (id) => document.getElementById(id);

function hourKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}`;
}

function hashHour(key) {
  let n = 2166136261;
  for (let i = 0; i < key.length; i++) {
    n ^= key.charCodeAt(i);
    n = Math.imul(n, 16777619);
  }
  return Math.abs(n);
}

function prettyTime(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function show(name) {
  document.querySelectorAll(".pane").forEach((el) => el.classList.toggle("is-on", el.id === `view-${name}`));
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.classList.toggle("is-current", el.getAttribute("data-nav") === name);
  });
}

function setAuthUi() {
  const chip = $("authChip");
  const who = $("signedAs");
  const compose = $("compose");
  if (state.user) {
    const label = state.profile?.handle || state.user.email;
    chip.textContent = "Sign out";
    who.textContent = label;
    compose.classList.remove("is-hidden");
    $("deskCopy").textContent = "Kept here. Tick public if it should sit on the wall.";
  } else {
    chip.textContent = "Sign in";
    who.textContent = "";
    compose.classList.add("is-hidden");
    $("deskCopy").textContent = "Sign in to keep notes. Public ones appear on the wall.";
  }
}

function cardHtml(note, mine) {
  const title = note.title?.trim() || "Untitled";
  const handle = note.profiles?.handle ? `@${note.profiles.handle}` : mine ? "you" : "anon";
  const flag = note.is_public ? "public" : "private";
  const actions = mine
    ? `<button type="button" data-del="${note.id}">Remove</button>`
    : `<span>${handle}</span>`;
  return `<article class="card">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(note.body || "")}</p>
    <div class="meta"><span>${flag} · ${prettyTime(note.created_at)}</span>${actions}</div>
  </article>`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderFeature() {
  const key = hourKey();
  const pool = state.publicNotes;
  const pick = pool.length
    ? pool[hashHour(key) % pool.length]
    : FALLBACKS[hashHour(key) % FALLBACKS.length];
  $("hourLabel").textContent = `This hour · ${key.replace("T", " ")} UTC`;
  $("featureTitle").textContent = pick.title?.trim() || "Untitled";
  $("featureBody").textContent = pick.body || "";
  $("featureBy").textContent = pick.profiles?.handle
    ? `left by @${pick.profiles.handle}`
    : pool.length ? "from the wall" : "house copy, until someone publishes";
}

function tickMeter() {
  const now = new Date();
  const elapsed = (now.getUTCMinutes() * 60 + now.getUTCSeconds()) / 3600;
  $("meterFill").style.width = `${Math.min(100, elapsed * 100)}%`;
  const left = 3600 - (now.getUTCMinutes() * 60 + now.getUTCSeconds());
  const m = Math.floor(left / 60);
  const s = left % 60;
  $("meterCopy").textContent = `${m}m ${String(s).padStart(2, "0")}s until the next hour`;
}

async function loadPublic() {
  const { data } = await db
    .from("pieces")
    .select("id,title,body,is_public,created_at,user_id,profiles(handle,display_name)")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(80);
  state.publicNotes = data || [];
  $("wallGrid").innerHTML = state.publicNotes.length
    ? state.publicNotes.map((n) => cardHtml(n, false)).join("")
    : `<article class="card"><h3>Empty wall</h3><p>The first public note becomes the room.</p></article>`;
  renderFeature();
}

async function loadDesk() {
  if (!state.user) {
    $("deskGrid").innerHTML = "";
    return;
  }
  const { data } = await db
    .from("pieces")
    .select("id,title,body,is_public,created_at")
    .eq("user_id", state.user.id)
    .order("created_at", { ascending: false });
  $("deskGrid").innerHTML = (data || []).map((n) => cardHtml(n, true)).join("");
}

async function ensureProfile(user) {
  const { data } = await db.from("profiles").select("id,handle,display_name").eq("id", user.id).maybeSingle();
  if (data) {
    state.profile = data;
    return;
  }
  const handle = (user.user_metadata?.handle || user.email.split("@")[0] || "reader")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 24) || `reader${user.id.slice(0, 6)}`;
  await db.from("profiles").insert({
    id: user.id,
    handle,
    display_name: user.user_metadata?.display_name || handle,
  });
  state.profile = { id: user.id, handle, display_name: handle };
}

async function onSession(session) {
  state.user = session?.user || null;
  if (state.user) await ensureProfile(state.user);
  else state.profile = null;
  setAuthUi();
  await loadDesk();
}

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    show(btn.getAttribute("data-nav"));
  });
});

$("authChip").addEventListener("click", async () => {
  if (state.user) {
    await db.auth.signOut();
    return;
  }
  show("auth");
});

$("authFlip").addEventListener("click", () => {
  state.signup = !state.signup;
  $("authHeading").textContent = state.signup ? "Create a desk" : "Sign in";
  $("authSubmit").textContent = state.signup ? "Create" : "Enter";
  $("authFlip").textContent = state.signup ? "Have one already? Sign in" : "Need a desk? Create one";
  $("handleField").classList.toggle("is-hidden", !state.signup);
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const email = String(form.get("email") || "");
  const password = String(form.get("password") || "");
  const handle = String(form.get("handle") || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  $("authNotice").textContent = "";
  if (state.signup) {
    const { error } = await db.auth.signUp({
      email,
      password,
      options: { data: { handle, display_name: handle } },
    });
    $("authNotice").textContent = error
      ? error.message
      : "Desk created. If email confirm is on, check your inbox; otherwise you can write now.";
  } else {
    const { error } = await db.auth.signInWithPassword({ email, password });
    $("authNotice").textContent = error ? error.message : "";
    if (!error) show("desk");
  }
});

$("compose").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return;
  const form = new FormData(e.target);
  const title = String(form.get("title") || "").trim();
  const body = String(form.get("body") || "").trim();
  const is_public = form.get("is_public") === "on";
  if (!body) return;
  const { error } = await db.from("pieces").insert({
    user_id: state.user.id,
    title,
    body,
    is_public,
  });
  if (error) {
    alert(error.message);
    return;
  }
  e.target.reset();
  await Promise.all([loadDesk(), loadPublic()]);
});

$("deskGrid").addEventListener("click", async (e) => {
  const id = e.target.getAttribute("data-del");
  if (!id) return;
  await db.from("pieces").delete().eq("id", id);
  await Promise.all([loadDesk(), loadPublic()]);
});

db.auth.onAuthStateChange((_event, session) => {
  onSession(session);
});

(async function start() {
  const { data } = await db.auth.getSession();
  await onSession(data.session);
  await loadPublic();
  tickMeter();
  setInterval(() => {
    const prev = $("hourLabel").textContent;
    tickMeter();
    renderFeature();
    if ($("hourLabel").textContent !== prev) loadPublic();
  }, 1000);
})();
