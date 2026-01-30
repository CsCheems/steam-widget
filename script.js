const urlSearch = window.location.search;
const params = new URLSearchParams(urlSearch);

const allowSb = obtenerBoolean("allowSb", "true");
const StreamerbotAdress = params.get("sbAdress") || "127.0.0.1";
const StreamerbotPort = params.get("sbPort") || "8080";
const steamid = params.get("steam_id") || "";
const steamkey = params.get("steam_web_key") || "";

const standbyText = document.getElementById("standbyText");
const widgetContent = document.getElementById("widgetContent");
const card = document.getElementById("card");

let achievementQueue = [];
let lastGame = "";
let achievementIndex = 0;
let achievementInterval = null;
let sbConnect = false;
const baseUrl = "http://localhost:3000";

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

  const res = await fetch(`${baseUrl}/api/steam/achievements?steamid=${steamid}&steamkey=${steamkey}`);
  const data = await res.json();

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

  if (changed) {
    achievementQueue = newQueue;

    if (achievementQueue.length > 0) {
      startAchievementRotation();
    } else {
      showAchievement(0);
    }
  }

}

let outer = document.getElementById("steam-wrapper");

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
  if(!allowSb) return;
  const juego = limpiarNombreJuego(game);
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

setInterval(updateWidget, 10000);
updateWidget();

