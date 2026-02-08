

const urlSearch = window.location.search;
const params = new URLSearchParams(urlSearch);

let numeroLogros = Number(params.get("numeroLogros") || 1);
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

const standbyText = document.getElementById("standbyText");
const widgetContent = document.getElementById("widgetContent");
const card = document.getElementById("card");
const wrapper = document.querySelector("wrapperFade");
const trophyLabel = document.getElementById("trophylabel");

const unlockOverlay = document.getElementById("unlockOverlay");
const unlockContent = document.querySelector(".unlock-content");
const unlockImage = document.getElementById("unlockImage");
const unlockTitle = document.getElementById("unlockTitle");
const unlockDesc = document.getElementById("unlockDesc");

let itsVisible = false;
let achievementQueue = [];
let lastGame = "";
let achievementIndex = 0;
let achievementInterval = null;
let sbConnect = false;
let unlockQueue = [];
let unlockPlaying = false;
let lastUnlockId = null;
const baseUrl = "https://steam-backend-tw9u.onrender.com";
const mockUrl = "http://localhost:3000"

const client = new StreamerbotClient({
  host: StreamerbotAdress,
  port: StreamerbotPort,
  onConnect: (data) =>{
    sbConnect = true;
    console.log(data);
  },
  onDisconnect: (data) =>{
    sbConnect = false;
    console.log("Desconectado: ", data);
  }
})

async function updateWidget() {

  if(!steamid || !steamkey){
    console.error("Falto el Steam ID o Steam Web Key");
    return;
  }

  const res = await fetch(`${baseUrl}/api/steam/achievements?steamid=${steamid}&steamkey=${steamkey}&numeroLogros=${numeroLogros}`);
  const data = await res.json();

  console.debug("DATA:", data);
  //console.debug("ULTIMOS LOGROS:", data.lastAchievements);

  if (data.newAchievements?.length) {
    for (const ach of data.newAchievements) {
      if (ach.id !== lastUnlockId) {
        unlockQueue.push(ach);
        lastUnlockId = ach.id;
      }
    }
    mostrarSiguiente();
  }

  if (!data.active) {
    card.style.setProperty("--card-bg-image", "none");
    document.getElementById("progressPercent").textContent = "";
    widgetContent.classList.remove("show");
    setTimeout(() => {
      widgetContent.style.display = "none";
      standbyText.style.display = "block";
      
      standbyText.textContent = data.message || "Listo para monitorear";
    }, 500);

    return;
  }

  card.style.setProperty("--card-bg-image", `url("${data.game.image}")`);

  standbyText.style.display = "none";
  widgetContent.style.display = "flex";
  requestAnimationFrame(() => widgetContent.classList.add("show"));

  document.getElementById("gameName").textContent = data.game.name;

  if(data.game.name !== lastGame){
    lastGame = data.game.name;
    if(allowSb){
      cambiarCategoria(lastGame);
    }
  }
  
  document.getElementById("timePlayed").textContent = data.game.timePlayed;

  document.getElementById("achvCount").textContent =
    `${data.progress.desbloqueado}/${data.progress.total}`;

  document.getElementById("progressFill").style.width =
    `${data.progress.percentage}%`;

  document.getElementById("progressPercent").textContent =
    `${data.progress.percentage}%`;

  const newQueue = data.lastAchievements || [];

  const changed =
    JSON.stringify(newQueue) !== JSON.stringify(achievementQueue);
  console.log(changed);
  if (changed) {
    achievementQueue = newQueue;
    toggleVisibility();
    if (achievementQueue.length > 1) {
      trophyLabel.textContent = `Últimos logros obtenidos`;
      startAchievementRotation();
    } else {
      trophyLabel.textContent = "Último logro obtenido";
      showAchievement(0);
    }
  }

}

let outer = document.getElementById("steam-wrapper");

function toggleVisibility(){
  if(hideAfter === 0) return;
  outer.classList.remove("hidden");
  setTimeout(() => {
    outer.classList.add("hidden");
  }, hideAfter * 1000);
}

function resize(){
  const maxWidth = outer.clientWidth + 50;
  const maxHeight = window.innerHeight + 50;
  
  const scaleW = window.innerHeight / maxWidth;
  const scaleH = window.innerHeight / maxHeight;

  const maxScale = 2.0;

  const scale = Math.min(scaleW, scaleH, maxScale);

  outer.style.transformOrigin = "center";
  outer.style.transform = `scale(${scale})`;
}

window.addEventListener("resize", resize);

window.onload = () => {
  resize();
}

function showAchievement(index) {

  const display = document.getElementById("trophyDisplay");

  if (!achievementQueue.length) {
    document.getElementById("trophyName").textContent =
      "Sin logros recientes";

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
  if (achievementInterval) clearInterval(achievementInterval);
  achievementIndex = 0;
  showAchievement(achievementIndex);
  achievementInterval = setInterval(() => {
    achievementIndex = (achievementIndex + 1) % achievementQueue.length;
    showAchievement(achievementIndex);
  }, 10000); 
}

async function cambiarCategoria(game){
  let juego = limpiarNombreJuego(game);
  console.log("Titulo Limpio:", juego);
  try{
    await client.doAction(
      {
        name:"Cambiar Categoria"
      },
      {
        game: juego
      }
    );
  }catch(err){
    console.error("Error enviando accion a Streamerbot", err);
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

function obtenerBoolean(param, valor){
  const urlParam = new URLSearchParams(window.location.search);
  if(urlParam === null) return;

  const valorParam = urlParam.get(param);

  if(valorParam === "true"){
    return true;
  }else if(valorParam === "false"){
    return false;
  }else{
    return valor;
  }
}

function mostrarLogro(achievement, onDone) {

  widgetContent.classList.add("dimmed");

  unlockContent.classList.add("hidden");

  setTimeout(() => {

    unlockImage.src = achievement.image;
    unlockTitle.textContent = achievement.name;
    unlockDesc.textContent = achievement.description;

    unlockOverlay.classList.add("show");

    requestAnimationFrame(() => {
      unlockContent.classList.remove("hidden");
    });

  }, 400);

  setTimeout(() => {

    unlockContent.classList.add("hidden");

    setTimeout(() => {

      if (typeof onDone === "function") {
        onDone();
      }

      if (unlockQueue.length === 0) {
        unlockOverlay.classList.remove("show");
        widgetContent.classList.remove("dimmed");
      }

    }, 400);

  }, 8000);
}




function mostrarSiguiente() {
  if (unlockPlaying) return;
  if (unlockQueue.length === 0) return;

  unlockPlaying = true;

  const ach = unlockQueue.shift();
  mostrarLogro(ach, () => {
    unlockPlaying = false;
    mostrarSiguiente();
  });
}


setInterval(updateWidget, 10000);
updateWidget();


/* =========================
   MOCK STEAM API (DEV ONLY)
========================= */


const USE_MOCK = false;


const mockResponses = [
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
  // {
  //   active: true,
  //   game: {
  //     name: "Halo: The Master Chief Collection",
  //     image: "https://cdn.cloudflare.steamstatic.com/steam/apps/976730/header.jpg",
  //     timePlayed: "375.3 hrs"
  //   },
  //   progress: {
  //     desbloqueado: 163,
  //     total: 700,
  //     percentage: 23
  //   },
  //   lastAchievements: [],
  //   newAchievements: [
  //     {
  //       id: "Autopista de la costa",
  //       name: "Autopista de la costa",
  //       image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/f9c235fb5c6bb7a19a816ad7aa2b978933682217.jpg",
  //       description: "H3: ODST: completaste Autopista de la costa.",
  //       achieved: true,
  //       unlocktime: Date.now()
  //     }
  //   ]
  // },
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
        unlocktime: Date.now()
      },
      {
        id: "Déjà Vu",
        name: "Déjà Vu",
        image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/d97ee378cac6c6045e2ba998721951299028093c.jpg",
        description: "ODST en legendario con Hierro.",
        achieved: true,
        unlocktime: Date.now()
      },
      {
        id: "Volver",
        name: "Volver",
        image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/f1fa005a6b9d12a8d65e30d8b94260a4dfcc1c84.jpg",
        description: "Halo 3 completado.",
        achieved: true,
        unlocktime: Date.now()
      }
    ]
  },
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
        id: "Volver",
        name: "Volver",
        image: "https://steamcdn-a.akamaihd.net/steamcommunity/public/images/apps/976730/f1fa005a6b9d12a8d65e30d8b94260a4dfcc1c84.jpg",
        description: "Halo 3 completado.",
        achieved: true,
        unlocktime: Date.now()
      }
    ]
  }
];

let mockIndex = 0;

if (USE_MOCK) {
  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    console.warn(args[0]);

    const data =
      mockResponses[mockIndex] ||
      mockResponses[mockResponses.length - 1];

    mockIndex++;

    return {
      ok: true,
      json: async () => structuredClone(data)
    };
  };
}
