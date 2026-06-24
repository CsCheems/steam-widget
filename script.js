
/* =========================
   URL PARAMS
========================= */
      
const urlSearch = window.location.search;
const params = new URLSearchParams(urlSearch);

let numeroLogros = Number(params.get("numeroLogros") || 5);
//Si el usuario coloca en el url un numero mayor al que se muestra en el menu, se usara el valor predeterminado de 3
if(numeroLogros > 5 || numeroLogros <= 0){
  numeroLogros = 3;
}

const allowSb = obtenerBoolean("allowSb", false);
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
let currentOverlay = "normal";
let isReload = true;


const DOCK_DATA_KEY = "steam_widget_dock_data";
const TRACKED_CONFIG_KEY = "steam_widget_tracked_config";
const GAME_NAME_OVERRIDE_KEY = "steam_widget_game_name_override";

const baseUrl = "https://steam-backend-tw9u.onrender.com";
const mockUrl = "http://localhost:3000"

/* =========================
   GLOBAL STATE
========================= */

const state = {
    active: null,
    appid: null,
    gameName: "",
    gameImage: "",
    progressPct: null,
    lastAchievementsIds: []
  };


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
});

client.on("General.Custom", (response) => {
	const data = response?.data;

	if (!data?.type) {
		return;
	}

	switch (data.type) {
		case "steam_achievement_history":
			handleAchievementHistory(data);
			break;

		case "steam_achievement":
			handleAchievementUnlocked(data);
			break;
	}
});

/* =========================
   UPDATE WIDGET
========================= */

let widgetUpdating = false;

function refreshAchievementDisplay() {
	achievementIndex = 0;

	if (!achievementQueue.length) {
		stopAchievementRotation();
		return;
	}

	showAchievement(0);

	if (achievementQueue.length > 1) {
		trophyLabel.textContent = "Latest Achievements";
		startAchievementRotation();
	} else {
		trophyLabel.textContent = "Latest Achievement";
		stopAchievementRotation();
	}
}

function achievementKey(ach) {
	return String(
		ach?.id ??
		`${ach?.name}|${ach?.image}`
	);
}

function extractIds(list = []) {
  	return list.map(achievementKey);
}

async function updateWidget() {

	if (widgetUpdating) {
		return;
	}

	widgetUpdating = true;

	try {
		if (!steamid || !steamkey) {
			console.error("Steam ID o Steam Web Key Missing");
			return;
		}

		let data;

		try {
			const res = await fetch(
				`${mockUrl}/api/steam/achievements?steamid=${steamid}&steamkey=${steamkey}&numeroLogros=${numeroLogros}&language=${language}`
			);

			data = await res.json();
		} catch (err) {
			console.error("Error reaching STEAM API:", err);
			return;
		}

		const theWholeDamnData = {
			appid: 			data?.game?.id,
			image: 			data?.game?.image,
			time: 			data?.game?.timePlayed,
			gameName: 		data?.game?.name ?? "",
			lastestAch: 	data?.lastAchievements,
			newAch: 		data?.newAchievements,
			unlockedAch: 	data?.progress?.desbloqueado,
			percentageAch: 	data?.progress?.percentage,
			totalAch: 		data?.progress?.total,
			blockedAch: 	data?.blockedAchievementsData,
			blockedAchCount: data?.blockedAchievementsCount,
			numeroLogros,
			updatedAt: 		Date.now()
		};

		console.log("DATA: ", theWholeDamnData);

		const currentRaw =
			localStorage.getItem(
				DOCK_DATA_KEY
			);

		const current =	currentRaw ? JSON.parse(currentRaw) : null;

		if (!current || current.gameName !== theWholeDamnData.gameName) {
			localStorage.setItem(DOCK_DATA_KEY, JSON.stringify(theWholeDamnData));
		}

		/* =========================
		ACTIVE / IDLE
		========================= */

		if (!data.active) {
			if (state.active !== false) {
				state.active = false;

				card.style.setProperty( "--card-bg-image", "none");

				widgetContent.classList.remove("show");

				setTimeout(() => {
					widgetContent.style.display =
						"none";

					hideTrackedAchievement();

					standbyContainer.style.opacity =
						1;

					standbyText.textContent =
						data.message ??
						"Ready to Monitor";
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

		updateOverlayState();

		/* =========================
		GAME IMAGE
		========================= */

		if (theWholeDamnData.image !== state.gameImage) {

			state.gameImage = theWholeDamnData.image;

			card.style.setProperty("--card-bg-image", `url("${state.gameImage}")`);

			extractAccentColor(state.gameImage)
				.then(applyColorTheme);
		}

		/* =========================
		APP ID
		========================= */

		const currentAppId = theWholeDamnData.appid;

		if (currentAppId && currentAppId !== state.appid) {
			state.appid = currentAppId;

			achievementQueue = [];
			unlockQueue = [];

			stopAchievementRotation();

			trophyLabel.textContent =
				"Latest Achievement";

			document.getElementById(
				"trophyName"
			).textContent =
				"Loading achievements...";

			document.querySelector(
				".trophyimg"
			).style.display =
				"none";

			if(!sbConnect){
				useApiDataFallback(theWholeDamnData);
			}

			enviarAppIdSteam(theWholeDamnData.appid, isReload);

			isReload = false;
			
		}

		/* =========================
		GAME NAME
		========================= */

		/* =========================
		GAME NAME
		========================= */

		const displayGameName =getDisplayGameName(theWholeDamnData.appid, theWholeDamnData.gameName);

		if (displayGameName !== state.gameName) {
			state.gameName = displayGameName;

			document.getElementById("gameName").textContent = displayGameName;

			if (allowSb) {
				cambiarCategoria(displayGameName);
			}
		}

		/* =========================
		TIME PLAYED
		========================= */

		document.getElementById("timePlayed").textContent = theWholeDamnData.time;
	} finally {
		widgetUpdating = false;
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
  console.log("E", e);
  if (e.key !== TRACKED_CONFIG_KEY) return;

  updateOverlayState();
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

function addAchievementToRotation(achievement) {
	achievementQueue = [
		achievement,
		...achievementQueue.filter(
		a =>
			achievementKey(a) !==
			achievementKey(
			achievement
			)
		)
	].slice(0, numeroLogros);

	state.lastAchievementsIds =
		extractIds(
		achievementQueue
		);

	refreshAchievementDisplay();

	console.log(
		"WS Queue:",
		achievementQueue.map(
			a => a.name
		)
	);

}

function handleAchievementUnlocked(data) {
	const achievement = {
		id: String(data.eventId),
		name: data.name,
		description: data.description,
		image: data.image
	};

	unlockQueue.push(achievement);

	addAchievementToRotation(achievement);

	const percentage =
		Math.round(
		(data.achieved / data.total) * 100
		);

	state.progressPct = percentage;

	document.getElementById(
		"achvCount"
	).textContent =
		`${data.achieved}/${data.total}`;

	document.getElementById(
		"progressFill"
	).style.width =
		`${percentage}%`;

	document.getElementById(
		"progressPercent"
	).textContent =
		`${percentage}%`;

	if (!waitingForUnlockSequence) {
		waitingForUnlockSequence = true;
		handleNewAchievement();
	}
}

function handleAchievementHistory(data) {

	achievementQueue =
		(data.achievements ?? [])
		.slice(0, numeroLogros);

	state.lastAchievementsIds =
		extractIds(
		achievementQueue
		);

	if (
		typeof data.achievedUnlocked === "number" &&
		typeof data.totalAchievements === "number"
	) {
		const percentage =
		Math.round(
			(data.achievedUnlocked / data.totalAchievements) * 100
		);

		state.progressPct =
		percentage;

		document.getElementById(
		"achvCount"
		).textContent =
		`${data.achievedUnlocked}/${data.totalAchievements}`;

		document.getElementById(
		"progressFill"
		).style.width =
		`${percentage}%`;

		document.getElementById(
		"progressPercent"
		).textContent =
		`${percentage}%`;
	}

	refreshAchievementDisplay();

	if (
		!unlockQueue.length &&
		!unlockPlaying
	) {
		startHideAfter();
	}

}

/* =========================
   COLOR EXTRACTION
========================= */

async function extractAccentColor(imageUrl) {
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = "anonymous";

		img.onload = () => {
		const canvas = document.createElement("canvas");
		canvas.width = 64;
		canvas.height = 40;

		const ctx = canvas.getContext("2d");
		ctx.drawImage(img, 0, 0, 64, 40);

		const { data } = ctx.getImageData(0, 0, 64, 40);

		let bestColor = null;
		let bestScore = -1;

		for (let i = 0; i < data.length; i += 4) {
			const r = data[i];
			const g = data[i + 1];
			const b = data[i + 2];
			const a = data[i + 3];

			if (a < 200) continue;

			const max = Math.max(r, g, b) / 255;
			const min = Math.min(r, g, b) / 255;

			const l = (max + min) / 2;
			const s =
			max === min
				? 0
				: (max - min) / (1 - Math.abs(2 * l - 1));

			const score = s * (1 - Math.abs(l - 0.45));

			if (score > bestScore) {
			bestScore = score;
			bestColor = { r, g, b };
			}
		}

		resolve(bestColor || { r: 45, g: 115, b: 211 });
		};

		img.onerror = () => resolve({ r: 45, g: 115, b: 211 });
		img.src = imageUrl;
	});
}

function darkenColor({ r, g, b }, factor = 0.25) {
	return {
		r: Math.round(r * factor),
		g: Math.round(g * factor),
		b: Math.round(b * factor)
	};
}

function mixWithBlack({ r, g, b }, amount) {
		return {
			r: Math.round(r * (1 - amount)),
			g: Math.round(g * (1 - amount)),
			b: Math.round(b * (1 - amount))
		};
}

function brightenColor({ r, g, b }, amount = 0.5) {
	return {
		r: Math.round(r + (255 - r) * amount),
		g: Math.round(g + (255 - g) * amount),
		b: Math.round(b + (255 - b) * amount)
	};
}

function applyColorTheme({ r, g, b }) {
	const root = document.documentElement;

	const dark1 = mixWithBlack({ r, g, b }, 0.60);
	const dark2 = mixWithBlack({ r, g, b }, 0.35);

	const progressColor = brightenColor(
		{ r, g, b },
		0.3
	);

	root.style.setProperty(
		"--card-bg",
		`linear-gradient(
		135deg,
		rgb(${dark1.r},${dark1.g},${dark1.b}) 0%,
		rgb(${dark2.r},${dark2.g},${dark2.b}) 100%
		)`
	);

	root.style.setProperty(
		"--progress-fill",
		`linear-gradient(
			90deg,
			rgb(${progressColor.r},
				${progressColor.g},
				${progressColor.b}),
			rgb(
				${Math.min(progressColor.r + 30, 255)},
				${Math.min(progressColor.g + 30, 255)},
				${Math.min(progressColor.b + 30, 255)}
			)
		)`
	);

	root.style.setProperty(
		"--shadow-main",
		`8px 8px 12px rgba(${r},${g},${b},0.45)`
	);

	root.style.setProperty(
		"--divider-color",
		`rgba(${r},${g},${b},0.35)`
	);
}



/* =========================
   API FALLBACK
========================= */

function useApiDataFallback(data){

	achievementQueue =(data.lastestAch ?? []).slice(0, numeroLogros);

	state.lastAchievementsIds = extractIds(achievementQueue);

	const percentage = data.percentageAch;

	state.progressPct = percentage;

	document.getElementById("progressFill").style.width = `${percentage}`;

	document.getElementById("achvCount").textContent = `${data.unlockedAch}/${data.totalAch}`;

	document.getElementById("progressPercent").textContent = `${percentage}%`;

	refreshAchievementDisplay();

	if (!unlockQueue.length && !unlockPlaying) {
		startHideAfter();
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

async function enviarAppIdSteam(appid, isReload) {
	console.log(appid);
	if (!sbConnect || !appid) {
		return;
	}

	try {
		await client.doAction(
			{ name: "get app id" },
			{ 
				appid: String(appid),
				action: isReload 
			}
		);

		console.debug(
			"[STEAM] AppID enviado a Streamer.bot:",
			appid
		);
	} catch (err) {
			console.error(
			"Error enviando AppID a Streamer.bot:",
			err
		);
	}
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

function getDisplayGameName(appid, steamGameName) {
    try{

        const overrides = JSON.parse(localStorage.getItem(GAME_NAME_OVERRIDE_KEY) || "{}");

        return (
            overrides[String(appid)] ||
            steamGameName
        );

    }catch{

        return steamGameName;
    }
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
        unlockPlaying = false;
        updateOverlayState();
        startHideAfter();

      }
    }, 400);
  }, 8000);
  
}

function mostrarSiguiente() {
  if (unlockPlaying || unlockQueue.length === 0) return;
  unlockPlaying = true;
  updateOverlayState();
  const isLast = unlockQueue.length === 1;
  const ach = unlockQueue.shift();
  mostrarLogro(ach, isLast, () => {
    unlockPlaying = false;
    mostrarSiguiente();
  });
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
   OVERLAY MANAGER
========================= */

function updateOverlayState(){
	const tracked = getTrackedConfig();

	if(unlockPlaying || unlockQueue.length > 0){
		currentOverlay = "unlock";
		widgetContent.style.display = "none";
		hideTrackedAchievement();
		return;
	}

	if(tracked?.enabled){
		currentOverlay = "tracked";
		widgetContent.style.display = "none";
		renderTrackedAchievement(tracked);
		return;
	}

	currentOverlay = "normal";
	hideTrackedAchievement();
	widgetContent.style.display = "flex";
}

/* =========================
   INTERVAL
========================= */

setInterval(updateWidget, 6000);
updateWidget();

window.addEventListener('DOMContentLoaded', () => {
    console.log("La aplicación se ha iniciado o reiniciado. Limpiando Streamer.bot...");
    isReload = true;
});