
/* =========================
   URL PARAMS
========================= */
      
const urlSearch = window.location.search;
const params = new URLSearchParams(urlSearch);

let numeroLogros = Number(params.get("numeroLogros") || 3);
//Si el usuario coloca en el url un numero mayor al que se muestra en el menu, se usara el valor predeterminado de 3
if(numeroLogros > 5 || numeroLogros <= 0){
  numeroLogros = 3;
}
const allowSb = obtenerBoolean("allowSb", true);
const StreamerbotAdress = params.get("hostInput") || "127.0.0.1";
const StreamerbotPort = params.get("portInput") || "8080";
const steamid = params.get("steam_id") || window.ENV_STEAM_ID;
const steamkey = params.get("steam_web_key") || window.ENV_STEAM_KEY;
const hideAfter = Number(params.get("hideAfter") || 0);
const language = params.get("language") || "latam";

/* =========================
   DOM ELEMENTS
========================= */

const standbyContainer = document.getElementById("standbyContainer");
const widgetContent = document.getElementById("widgetContent");
const card = document.getElementById("card");
const wrapper = document.querySelector(".wrapperFade");
const trophyLabel = document.getElementById("trophylabel");

const unlockOverlay = document.getElementById("unlockOverlay");
const unlockContent = document.querySelector(".unlock-content");
const unlockImage = document.getElementById("unlockImage");
const unlockTitle = document.getElementById("unlockTitle");
const unlockDesc = document.getElementById("unlockDesc");

const trackingOverlay = document.getElementById("trackingOverlay");

let outer = document.getElementById("steam-wrapper");

/* =========================
   STATE VARIABLES
========================= */

let itsVisible = false;
let achievementQueue = [];
let lastGame = "";
let achievementIndex = 0;
let achievementInterval = null;
let sbConnect = false;
let unlockQueue = [];
let unlockPlaying = false;
let lastUnlockId = null;
let pendingHideTimeout = null;
let waitingForUnlockSequence = false;


const STORAGE_KEY = "steam_achievements";
const DOCK_DATA_KEY = "steam_widget_dock_data";
const TRACKED_CONFIG_KEY = "steam_widget_tracked_config";

let knownAchievementIds = new Set();
let hasBootstrappedAchievements = false;

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  if (Array.isArray(parsed)) {
    knownAchievementIds = new Set(parsed);
  }
} catch (e) {
  console.warn("Storage corrupto, reiniciando achievements", e);
  localStorage.removeItem(STORAGE_KEY);
}

const processedUnlockIds = new Set();
const baseUrl = "https://steam-backend-tw9u.onrender.com";
const mockUrl = "http://localhost:3000"

/* =========================
   GLOBAL STATE
========================= */

const state = {
  active: null,
  gameName: "",
  gameImage: "",
  progressPct: null,
  lastAchievementsIds: []
};

function extractIds(list = []) {
  return list.map(a => a.id ?? `${a.name}|${a.image}`);
}

function arraysEqual(a = [], b = []) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/* =========================
   STREAMERBOT CLIENT
========================= */

const client = new StreamerbotClient({
  host: StreamerbotAdress,
  port: StreamerbotPort,
  onConnect: (data) =>{
    sbConnect = true;
    console.log(data);
  },
  onDisconnect: () =>{
    sbConnect = false;
  }
})

/* =========================
   UPDATE WIDGET
========================= */

async function updateWidget() {

  if(!steamid || !steamkey){
    console.error("Falto el Steam ID o Steam Web Key");
    return;
  }

  const res = await fetch(`${baseUrl}/api/steam/achievements?steamid=${steamid}&steamkey=${steamkey}&numeroLogros=${numeroLogros}&language=${language}`);
  const data = await res.json();

  console.debug("DATA:", data);
  
  const theWholeDamnData = {
    steamkey,
    steamid,
    language,
    gameName: data?.game?.name ?? "",
    achievementsList: data?.blockedAchievementsData ?? [],
    numeroLogros,
    updatedAt: Date.now()
  };

  localStorage.setItem(DOCK_DATA_KEY, JSON.stringify(theWholeDamnData));

  

  const last = data.lastAchievements || [];
  const newlyUnlocked = [];

  if(!hasBootstrappedAchievements){
    for(const ach of last){
      if(ach?.id){
        knownAchievementIds.add(ach.id);
      }
    }

    localStorage.setItem(
      STORAGE_KEY, 
      JSON.stringify([...knownAchievementIds])
    );

    hasBootstrappedAchievements = true;

  }else{
    for(const ach of last){
      if(ach?.id && !knownAchievementIds.has(ach.id)){
        knownAchievementIds.add(ach.id);
        newlyUnlocked.push(ach);
      }
    }

    if(newlyUnlocked.length){
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([...knownAchievementIds])
      );
    }
  }

  /* =========================
     ACTIVE / IDLE STATE
  ========================= */

  if (!data.active) {
    if (state.active !== false) {
      state.active = false;

      card.style.setProperty("--card-bg-image", "none");
      widgetContent.classList.remove("show");

      setTimeout(() => {
        widgetContent.style.display = "none";
        hideTrackedAchievement();
        standbyContainer.style.opacity = 1;
        standbyText.textContent = data.message || "Ready to Monitor";
      }, 500);
    }
    return;
  }

  if (state.active !== true) {
    state.active = true;
    standbyContainer.style.opacity = 0;
    widgetContent.style.display = "flex";
    requestAnimationFrame(() => widgetContent.classList.add("show"));
  }

  /* =========================
   TRACKING STATE
  ========================= */

  const tracked = getTrackedConfig();

  if (tracked?.enabled) {
    renderTrackedAchievement(tracked);
     widgetContent.style.display = "none";
  } else {
    hideTrackedAchievement();
     widgetContent.style.display = "flex";
  }

  /* =========================
  GAME DATA
  ========================= */

  if (data.game.image !== state.gameImage) {
    state.gameImage = data.game.image;
    card.style.setProperty("--card-bg-image", `url("${state.gameImage}")`);
  }

  if (data.game.name !== state.gameName) {
    state.gameName = data.game.name;
    document.getElementById("gameName").textContent = state.gameName;

    if (allowSb) {
      cambiarCategoria(state.gameName);
    }
  }

  document.getElementById("timePlayed").textContent = data.game.timePlayed;

  /* =========================
     PROGRESS
  ========================= */

  if (data.progress.percentage !== state.progressPct) {
    state.progressPct = data.progress.percentage;

    document.getElementById("achvCount").textContent =
      `${data.progress.desbloqueado}/${data.progress.total}`;

    document.getElementById("progressFill").style.width =
      `${data.progress.percentage}%`;

    document.getElementById("progressPercent").textContent =
      `${data.progress.percentage}%`;
  }

   /* =========================
     UNLOCK QUEUE
  ========================= */

  if (newlyUnlocked.length) {
    unlockQueue.push(...newlyUnlocked);

    if (!waitingForUnlockSequence) {
      waitingForUnlockSequence = true;
      handleNewAchievement();
    }
  }

  /* =========================
     LAST ACHIEVEMENTS ROTATION
  ========================= */

  const newQueue = data.lastAchievements || [];
  const newIds = extractIds(newQueue);

  const changed = !arraysEqual(newIds, state.lastAchievementsIds);

  if (changed) {
    state.lastAchievementsIds = newIds;
    achievementQueue = newQueue;

    if(!unlockQueue.length && !unlockPlaying){
      startHideAfter();
    }

    if (achievementQueue.length > 1) {
      trophyLabel.textContent = "Latest Achievements";
      startAchievementRotation();
    } else {
      trophyLabel.textContent = "Latest Achievement";
      stopAchievementRotation();
      showAchievement(0);
    }
  }

}

/* =========================
   VISIBILITY
========================= */

function startHideAfter(){
  if(hideAfter === 0) return;

  if(pendingHideTimeout){
    clearTimeout(pendingHideTimeout);
  }

  outer.classList.remove("hidden");

  pendingHideTimeout = setTimeout(() => {
    outer.classList.add("hidden");
  }, hideAfter * 1000);
}

/* =========================
   RESIZE
========================= */

function resize() {
  const maxWidth = outer.clientWidth + 50;
  const maxHeight = window.innerHeight + 50;

  const scaleW = window.innerHeight / maxWidth;
  const scaleH = window.innerHeight / maxHeight;

  const scale = Math.min(scaleW, scaleH, 2.0);
  outer.style.transformOrigin = "center";
  outer.style.transform = `scale(${scale})`;
}

/* =========================
   WINDOW
========================= */

window.addEventListener("resize", resize);
window.onload = resize;

window.addEventListener("storage", (e) => {
  if (e.key === TRACKED_CONFIG_KEY) {
    updateWidget();
  }
});

/* =========================
   ACHIEVEMENTS
========================= */

function showAchievement(index) {
  const display = document.getElementById("trophyDisplay");

  if (!achievementQueue.length) {
    document.getElementById("trophyName").textContent = "No achievements to show";
    document.querySelector(".trophyimg").style.display = "none";
    return;
  }

  const ach = achievementQueue[index];
  display.classList.add("hidden");

  setTimeout(() => {
    document.getElementById("trophyName").textContent = ach.name;
    const trophyImg = document.querySelector(".trophyimg");
    trophyImg.src = ach.image;
    trophyImg.style.display = ach.image ? "block" : "none";
    display.classList.remove("hidden");
  }, 600);
}

function startAchievementRotation() {
  stopAchievementRotation(); 
  achievementIndex = 0;
  showAchievement(achievementIndex);
  achievementInterval = setInterval(() => {
    achievementIndex = (achievementIndex + 1) % achievementQueue.length;
    showAchievement(achievementIndex);
  }, 10000);
}

function stopAchievementRotation() {
  if (achievementInterval) {
    clearInterval(achievementInterval);
    achievementInterval = null;
  }
}

/* =========================
   STREAMERBOT
========================= */

async function cambiarCategoria(game) {
  let juego = limpiarNombreJuego(game);
  try {
    await client.doAction({ name: "Cambiar Categoria" }, { game: juego });
  } catch (err) {
    console.error("Error Streamerbot:", err);
  }
}

function limpiarNombreJuego(nombre) {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 :']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


/* =========================
   HELPERS
========================= */

function obtenerBoolean(param, valor) {
  const valorParam = new URLSearchParams(window.location.search).get(param);
  if (valorParam === "true") return true;
  if (valorParam === "false") return false;
  return valor;
}

/* =========================
   UNLOCK OVERLAY
========================= */

function handleNewAchievement(){
  if(pendingHideTimeout){
    clearTimeout(pendingHideTimeout);
    pendingHideTimeout = null;
  }
  if(hideAfter > 0){
    outer.classList.add("hidden");
    setTimeout(() => {
      outer.classList.remove("hidden");
      mostrarSiguiente();
    }, 5000);
  }else{
    mostrarSiguiente();
  }
}

function mostrarLogro(achievement, isLast, onDone) {
  widgetContent.classList.add("dimmed");
  unlockContent.classList.add("hidden");
  
  setTimeout(() => {
    unlockImage.src = achievement.image;
    unlockTitle.textContent = achievement.name;
    unlockDesc.textContent = achievement.description;
    unlockOverlay.classList.add("show");
    requestAnimationFrame(() => unlockContent.classList.remove("hidden"));
  }, 400);

  setTimeout(() => {
    unlockContent.classList.add("hidden");
    setTimeout(() => {
      if (typeof onDone === "function") onDone();
     if (isLast) {
        unlockOverlay.classList.remove("show");
        widgetContent.classList.remove("dimmed");

        waitingForUnlockSequence = false;

        startHideAfter();
      }
    }, 400);
  }, 8000);
  
}

function mostrarSiguiente() {
  if (unlockPlaying || unlockQueue.length === 0) return;
  unlockPlaying = true;
  console.log("▶ Overlay start", unlockQueue.map(a => a.id));
  const isLast = unlockQueue.length === 1;

  const ach = unlockQueue.shift();
  mostrarLogro(ach, isLast, () => {
    unlockPlaying = false;
    mostrarSiguiente();
  });
  console.log("✔ Overlay finished");
}

/* =========================
   TRACK OVERLAY
========================= */

function getTrackedConfig() {
  try {
    const raw = localStorage.getItem(TRACKED_CONFIG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed;
  } catch (err) {
    return null;
  }
}


function renderTrackedAchievement(tracked) {
  const overlay = document.getElementById("trackingOverlay");

  document.getElementById("trackingTitle").textContent = tracked.name;
  document.getElementById("trackingDesc").textContent = tracked.description || "Hidden achievements don't have descriptions";
  document.getElementById("trackingImage").src = tracked.image;

  overlay.style.opacity = 1;
}

function hideTrackedAchievement() {
  const overlay = document.getElementById("trackingOverlay");
  overlay.style.opacity = 0;
}

/* =========================
   INTERVAL
========================= */

setInterval(updateWidget, 10000);
updateWidget();

