
const DOCK_DATA_KEY = "steam_widget_dock_data";
const TRACKED_CONFIG_KEY = "steam_widget_tracked_config";

window.uiReady = new Promise((resolve) => {
  window.__resolveUIReady = resolve;
});

const $ = (sel) => document.querySelector(sel);

const els = {
  appTitle: $("#appTitle"),
  appSubtitle: $("#appSubtitle"),

  baseUrl: $("#baseUrl"),
  finalUrl: $("#finalUrl"),

  formMount: $("#formMount"),

  copyBtn: $("#copyBtn"),

  widgetUrl: $("#widgetUrlInput"),
  copyBtn: $("#btnWidgetUrl"),
  statusPill: $("#statusPill"),
  countPill: $("#countPill"),
  sectionsMount: document.querySelector(".left"),
};



// --------------------------
// Estado inicial
// --------------------------
function setDefaultState() {
    state = state || {};

    for (const section of schema.sections) {
        for (const field of section.fields) {

        if (state[field.id] !== undefined && state[field.id] !== "") {
            continue;
        }
        state[field.id] = field.default ?? "";
        }
    }
}


// --------------------------
// Render de secciones
// --------------------------
function renderSections() {
  // eliminar cards dinámicas previas
  els.sectionsMount
    .querySelectorAll(".card.dynamic")
    .forEach((c) => c.remove());

  for (const section of schema.sections) {
    const card = document.createElement("div");
    card.className = "card dynamic";

    card.innerHTML = `
      <div class="cardHeader">
        <h2 class="cardTitle">${section.title}</h2>
        <p class="cardHint">${section.description ?? ""}</p>
      </div>
    `;

    const body = document.createElement("div");
    body.className = "sectionBody";

    section.fields.forEach((field) => {
      body.appendChild(renderField(field));
    });

    card.appendChild(body);
    els.sectionsMount.appendChild(card);
  }
}

function renderField(field) {
  const wrap = document.createElement("div");
  wrap.className = "field";

  const label = document.createElement("div");
  label.className = "fieldLabel";

  const labelText = document.createElement("span");
  labelText.textContent = field.label;

  const meta = document.createElement("span");
  meta.className = "fieldMeta";
  meta.textContent = field.param;

  label.append(labelText, meta);
  wrap.appendChild(label);

  const row = document.createElement("div");
  row.className = "row";

  const controlRow = document.createElement("div");
  controlRow.className = "row";

  let input;

  // SWITCH
  if (field.type === "switch") {
    input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!state[field.id];

    const line = document.createElement("label");
    line.className = "switchLine";
    line.appendChild(input);

    const txt = document.createElement("span");
    txt.textContent = input.checked ? "Enabled" : "Disabled";
    line.appendChild(txt);

    input.addEventListener("change", () => {
      state[field.id] = input.checked;
      txt.textContent = input.checked ? "Enabled" : "Disabled";
      pushTrackedConfigToWidget();
    });

    row.appendChild(line);
    wrap.appendChild(row);
    return wrap;
  }

  if (field.type === "range") {
      const range = document.createElement("input");
      range.type = "range";
      range.className = "range";
      range.min = field.min;
      range.max = field.max;
      range.step = field.step ?? 1;
      range.value = state[field.id];

      const valuePill = document.createElement("span");
      valuePill.className = "pill";
      valuePill.textContent = `${range.value}${field.suffix ?? ""}`;

      range.addEventListener("input", () => {
      state[field.id] = Number(range.value);
      valuePill.textContent = `${range.value}${field.suffix ?? ""}`;
      refreshPreview();
      });

      controlRow.appendChild(range);
      controlRow.appendChild(valuePill);
      wrap.appendChild(controlRow);
      return wrap;
  }

  if (field.type === "select") {
        const select = document.createElement("select");
        select.className = "input";
        select.id = field.id;

        let options = field.options ?? [];

        if(field.id === "lockedAchievement" && Array.isArray(window.__achievementsFromWidget)){
          options = window.__achievementsFromWidget.map((ach) => ({
            value: ach.id,
            label: ach.name || ach.id
          }));
        }

        options.forEach((opt) => {
            const option = document.createElement("option");
            option.value = String(opt.value);
            option.textContent = opt.label;
            select.appendChild(option);
        });

        select.value = String(state[field.id] ?? field.default);

        select.addEventListener("change", () => {
            state[field.id] = select.value;
            pushTrackedConfigToWidget();
            
        });

        wrap.appendChild(select);
        return wrap;
    }

  if (field.description) {
    const desc = document.createElement("div");
    desc.className = "fieldDesc";
    desc.textContent = field.description;
    wrap.appendChild(desc);
  }

  // NUMBER / TEXT
  input = document.createElement("input");
  input.className = "input";
  if(field.type === "number"){
    input.type = "number";
  }else if(field.type === "password"){
    input.type = "password";
  }else{
    input.type = "text";
  }
  input.value = state[field.id];

  if (field.min !== undefined) input.min = field.min;
  if (field.max !== undefined) input.max = field.max;
  if (field.step !== undefined) input.step = field.step;
  if (field.placeholder) input.placeholder = field.placeholder;

  input.addEventListener("input", () => {
    state[field.id] =
      field.type === "number" ? Number(input.value) : input.value;
    pushTrackedConfigToWidget(); 
  });

  wrap.appendChild(input);
  return wrap;
}

function toQueryValue(field, value) {
    // Boolean switches -> "true"/"false"
    if (field.type === "switch") return value ? "true" : "false";
    // Everything else -> string
    return String(value ?? "");
}



async function init() {
  const res = await fetch("./config/config.json", { cache: "no-store" });
  schema = await res.json();
  console.debug("Schema: ", schema);
  
  setDefaultState();
  loadWidgetDataIntoState();
  renderSections();
  pushTrackedConfigToWidget();



}

function loadWidgetDataIntoState(){
  try{
    const raw = localStorage.getItem(DOCK_DATA_KEY);
    if(!raw) return;

    const widgetdata = JSON.parse(raw);

    state.gameName = widgetdata.gameName || "";

    window.__achievementsFromWidget = Array.isArray(widgetdata.achievementsList)
      ? widgetdata.achievementsList
      : [];

    if(!state.lockedAchievement && window.__achievementsFromWidget.length){
      state.lockedAchievement = window.__achievementsFromWidget[0].id;
    }

    if(state.lockedAchievement && !window.__achievementsFromWidget.some(a => a.id === state.lockedAchievement)){
      state.lockedAchievement = window.__achievementsFromWidget[0]?.id || "";
    }
  }catch(e){
    console.warn("Failed to load data: ", e);
  }
}

function pushTrackedConfigToWidget() {
  if (!window.__achievementsFromWidget) return;

  const selectedId = state.lockedAchievement;
  const isTracking = state.trackedMode ?? false;

  const selectedAchievement = window.__achievementsFromWidget.find(
    (a) => a.id === selectedId
  );

  if (!selectedAchievement) return;

  const trackedConfig = {
    enabled: isTracking,
    achievementId: selectedAchievement.id,
    name: selectedAchievement.name,
    description: selectedAchievement.description,
    image: selectedAchievement.icon || selectedAchievement.image,
    gameName: state.gameName,
    updatedAt: Date.now()
  };

  localStorage.setItem(
    TRACKED_CONFIG_KEY,
    JSON.stringify(trackedConfig)
  );
}

let schema = null;
let state = {};

document.addEventListener("DOMContentLoaded", init);

window.addEventListener("storage", (e) => {
  if(e.key !== DOCK_DATA_KEY) return;
  loadWidgetDataIntoState();
  renderSections();
});
