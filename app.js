const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let session = null;
let mode = "signin";

const $ = (id) => document.getElementById(id);

function show(id) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  $(id).classList.add("active");
}

function fmt(ts) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function hourProgress() {
  const now = new Date();
  const pct = ((now.getMinutes() * 60 + now.getSeconds()) / 3600) * 100;
  $("hourFill").style.width = pct + "%";
  const left = 60 - now.getMinutes();
  $("tick").textContent = left <= 1 ? "The next hour is almost here." : left + " minutes until the room turns.";
}

async function loadFeature() {
  const { data } = await sb
    .from("features")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  const f = data && data[0];
  if (!f) return;
  $("kicker").textContent = f.kicker || "This hour";
  $("featureTitle").textContent = f.title;
  $("featureBody").textContent = f.body;
  $("featureMeta").textContent = "Posted " + fmt(f.created_at);
}

async function loadWall() {
  const { data } = await sb
    .from("notes")
    .select("id,title,body,created_at,is_public")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(40);
  $("wallList").innerHTML = (data || [])
    .map(
      (n) => `<article class="card">
        <div class="badge">Public</div>
        <h3>${escapeHtml(n.title)}</h3>
        <p>${escapeHtml(n.body)}</p>
        <div class="when">${fmt(n.created_at)}</div>
      </article>`
    )
    .join("") || "<p class='sub'>The wall is empty for now.</p>";
}

async function loadDesk() {
  if (!session) {
    $("deskHint").textContent = "Sign in to keep notes. Public ones appear on the wall.";
    $("noteForm").classList.add("hidden");
    $("deskList").innerHTML = "";
    return;
  }
  $("deskHint").textContent = "These stay with your account. Tick public to put one on the wall.";
  $("noteForm").classList.remove("hidden");
  const { data } = await sb
    .from("notes")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });
  $("deskList").innerHTML = (data || [])
    .map(
      (n) => `<article class="card">
        <div class="badge">${n.is_public ? "Public" : "Private"}</div>
        <h3>${escapeHtml(n.title)}</h3>
        <p>${escapeHtml(n.body)}</p>
        <div class="when">${fmt(n.created_at)}</div>
      </article>`
    )
    .join("") || "<p class='sub'>Nothing on the desk yet.</p>";
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paintWho() {
  const email = session?.user?.email;
  $("who").textContent = email ? email : "Visitor";
  $("authBtn").textContent = email ? "Account" : "Sign in";
}

async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  session = data.session;
  paintWho();
  loadDesk();
}

document.querySelectorAll("[data-go]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const map = { wall: "view-wall", desk: "view-desk" };
    show(map[btn.dataset.go]);
    if (btn.dataset.go === "wall") loadWall();
    if (btn.dataset.go === "desk") loadDesk();
  });
});

document.querySelector(".mark").addEventListener("click", (e) => {
  e.preventDefault();
  show("view-home");
});

$("authBtn").addEventListener("click", () => show("view-auth"));

$("toggleMode").addEventListener("click", () => {
  mode = mode === "signin" ? "signup" : "signin";
  $("authTitle").textContent = mode === "signin" ? "Sign in" : "Create an account";
  $("toggleMode").textContent =
    mode === "signin" ? "Need an account? Create one" : "Have an account? Sign in";
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = fd.get("email");
  const password = fd.get("password");
  $("authMsg").textContent = "Working…";
  const fn =
    mode === "signin"
      ? sb.auth.signInWithPassword({ email, password })
      : sb.auth.signUp({ email, password });
  const { error } = await fn;
  if (error) {
    $("authMsg").textContent = error.message;
    return;
  }
  $("authMsg").textContent =
    mode === "signup"
      ? "Account saved. If email confirm is on, check your inbox; otherwise you are in."
      : "";
  await refreshAuth();
  show("view-desk");
});

$("noteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!session) return;
  const fd = new FormData(e.target);
  const { error } = await sb.from("notes").insert({
    user_id: session.user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: fd.get("is_public") === "on",
  });
  if (error) {
    alert(error.message);
    return;
  }
  e.target.reset();
  loadDesk();
  loadWall();
});

sb.auth.onAuthStateChange((_e, s) => {
  session = s;
  paintWho();
});

loadFeature();
loadWall();
refreshAuth();
hourProgress();
setInterval(hourProgress, 1000);
setInterval(loadFeature, 60 * 1000);
