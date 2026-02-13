
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

const standbyText = document.getElementById("standbyText");
const widgetContent = document.getElementById("widgetContent");
const card = document.getElementById("card");
const wrapper = document.querySelector(".wrapperFade");
const trophyLabel = document.getElementById("trophylabel");

const unlockOverlay = document.getElementById("unlockOverlay");
const unlockContent = document.querySelector(".unlock-content");
const unlockImage = document.getElementById("unlockImage");
const unlockTitle = document.getElementById("unlockTitle");
const unlockDesc = document.getElementById("unlockDesc");

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
  //console.debug("ULTIMOS LOGROS:", data.lastAchievements);

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
        standbyText.style.display = "block";
        standbyText.textContent = data.message || "Ready to Monitor";
      }, 500);
    }
    return;
  }

  if (state.active !== true) {
    state.active = true;
    standbyText.style.display = "none";
    widgetContent.style.display = "flex";
    requestAnimationFrame(() => widgetContent.classList.add("show"));
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

window.addEventListener("resize", resize);
window.onload = resize;

/* =========================
   ACHIEVEMENTS
========================= */

function showAchievement(index) {
  const display = document.getElementById("trophyDisplay");

  if (!achievementQueue.length) {
    document.getElementById("trophyName").textContent = "Sin logros recientes";
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
  stopAchievementRotation(); // 🔥 evita duplicar intervals
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

  outer.classList.add("hidden");

  setTimeout(() => {
    outer.classList.remove("hidden");
    mostrarSiguiente();
  }, 5000);
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
   INTERVAL
========================= */

setInterval(updateWidget, 10000);
updateWidget();

/* =========================
   MOCK STEAM API (TESTEO)
========================= */

const USE_MOCK = false;

/**
 * 🔒 Timestamps fijos para evitar que el sistema
 * detecte los mismos logros como "nuevos" cada fetch
 */
const UNLOCK_TIME_BASE = Date.now() - 60000;

const mockResponses = [
  // 1️⃣ Estado normal (sin logros nuevos)
  {
    active: true,
    game: {
      name: "Halo: The Master Chief Collection",
      image: "https://cdn.cloudflare.steamstatic.com/steam/apps/976730/header.jpg",
      timePlayed: "375.2 hrs"
    },
    progress: {
      desbloqueado: 162,
      total: 700,
      percentage: 23
    },
    lastAchievements: [],
    newAchievements: []
  },

  // 2️⃣ Tick con MULTIPLES logros nuevos (caso crítico)
  {
    active: true,
    game: {
      name: "Halo: The Master Chief Collection",
      image: "https://cdn.cloudflare.steamstatic.com/steam/apps/976730/header.jpg",
      timePlayed: "375.4 hrs"
    },
    progress: {
      desbloqueado: 165,
      total: 700,
      percentage: 24
    },
    lastAchievements: [],
    newAchievements: [
      {
        id: "Autopista de la costa",
        name: "Autopista de la costa",
        image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/f9c235fb5c6bb7a19a816ad7aa2b978933682217.jpg",
        description: "H3: ODST: completaste Autopista de la costa.",
        achieved: true,
        unlocktime: UNLOCK_TIME_BASE + 1000
      },
      {
        id: "Déjà Vu",
        name: "Déjà Vu",
        image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/d97ee378cac6c6045e2ba998721951299028093c.jpg",
        description: "ODST en legendario con Hierro.",
        achieved: true,
        unlocktime: UNLOCK_TIME_BASE + 2000
      },
      {
        id: "Volver",
        name: "Volver",
        image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/f1fa005a6b9d12a8d65e30d8b94260a4dfcc1c84.jpg",
        description: "Halo 3 completado.",
        achieved: true,
        unlocktime: UNLOCK_TIME_BASE + 3000
      }
    ]
  },

  // 3️⃣ Tick posterior (ya NO deben volver a mostrarse)
  {
    active: true,
    game: {
      name: "Halo: The Master Chief Collection",
      image: "https://cdn.cloudflare.steamstatic.com/steam/apps/976730/header.jpg",
      timePlayed: "375.4 hrs"
    },
    progress: {
      desbloqueado: 165,
      total: 700,
      percentage: 24
    },
    lastAchievements: [
      {
        id: "Volver",
        name: "Volver",
        image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/f1fa005a6b9d12a8d65e30d8b94260a4dfcc1c84.jpg"
      },
      {
        id: "Déjà Vu",
        name: "Déjà Vu",
        image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/d97ee378cac6c6045e2ba998721951299028093c.jpg"
      }
    ],
    newAchievements: []
  }
];

let mockIndex = 0;

if (USE_MOCK) {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    console.warn("MOCK FETCH:", args[0]);

    const data =
      mockResponses[mockIndex] ??
      mockResponses[mockResponses.length - 1];

    mockIndex++;

    return {
      ok: true,
      json: async () => structuredClone(data)
    };
  };
}
