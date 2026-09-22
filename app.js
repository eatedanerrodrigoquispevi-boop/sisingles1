// Municipalities by Department
const municipiosPorDepartamento = {
  "Beni": ["Trinidad", "Rurrenabaque", "Riberalta", "Guayaramerín", "San Borja", "Santa Ana de Yacuma"],
  "Chuquisaca": ["Sucre", "Tarabuco", "Camargo", "Monteagudo", "Padilla", "Zudáñez"],
  "Cochabamba": ["Cochabamba", "Quillacollo", "Sacaba", "Villa Tunari", "Tiquipaya", "Punata", "Cliza"],
  "La Paz": ["La Paz", "El Alto", "Copacabana", "Coroico", "Sorata", "Tiwanaku", "Chulumani", "Apolo"],
  "Oruro": ["Oruro", "Salinas de Garci Mendoza", "Huanuni", "Challapata", "Sabaya"],
  "Pando": ["Cobija", "Porvenir", "Puerto Rico", "Bella Flor", "Filadelfia"],
  "Potosí": ["Potosí", "Uyuni", "Tupiza", "Villazón", "Llallagua", "Toro Toro"],
  "Santa Cruz": ["Santa Cruz de la Sierra", "Samaipata", "San Ignacio de Velasco", "Roboré", "Puerto Suárez", "Buena Vista", "Cotoca"],
  "Tarija": ["Tarija", "San Lorenzo", "Bermejo", "Villa Montes", "Yacuiba", "Padcaya"]
};

let fullMap = null;
let fullMapMarkers = [];
let map = null;
let marker = null;
let chartDeptInstance = null;
let chartTypeInstance = null;

let currentEditingId = null;
let allAttractionsCache = [];

// Identificador único para el creador (Guardado localmente)
function getUserId() {
  let uid = localStorage.getItem("bolivia_tour_uid");
  if (!uid) {
    uid = "user_" + Math.random().toString(36).substr(2, 9) + "_" + Date.now();
    localStorage.setItem("bolivia_tour_uid", uid);
  }
  return uid;
}

const currentUserId = getUserId();

// DETECT NETWORK ONLINE/OFFLINE STATUS
function updateOnlineStatus() {
  const dot = document.getElementById("connectionStatusDot");
  const text = document.getElementById("connectionStatusText");
  
  if (navigator.onLine) {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
    if (text) text.innerText = "Sincronización Activa";
  } else {
    if (dot) dot.className = "w-2 h-2 rounded-full bg-amber-500";
    if (text) text.innerText = "Modo Offline (Almacenamiento Local)";
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// 1. INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
  updateOnlineStatus();
  setupDepartmentChangeListener();
  setupPhotoPreview();
  setupGeolocateButton();

  if (typeof db !== "undefined") {
    db.collection("attractions").onSnapshot({ includeMetadataChanges: true }, (snapshot) => {
      const attractions = [];
      snapshot.forEach(doc => {
        attractions.push({ id: doc.id, ...doc.data() });
      });

      allAttractionsCache = attractions;
      updateDashboardMetrics(attractions);

      if (!document.getElementById("tab-map-view").classList.contains("hidden")) {
        renderFullMap(attractions);
      }
      if (!document.getElementById("tab-list").classList.contains("hidden")) {
        renderAttractionsList(attractions);
      }
      if (!document.getElementById("tab-stats").classList.contains("hidden")) {
        renderStatistics(attractions);
      }
    });
  }

  switchTab("dashboard");
});

// GET ATTRACTIONS FROM FIRESTORE
async function getAttractions() {
  if (typeof db === "undefined") return [];
  try {
    const snapshot = await db.collection("attractions").get();
    const list = [];
    snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  } catch(e) {
    console.error("Error al leer caché:", e);
    return [];
  }
}

// 2. TABS NAVIGATION
async function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".nav-btn").forEach(el => {
    el.classList.remove("bg-sky-600/30", "text-sky-300", "font-semibold", "border", "border-sky-500/30");
    el.classList.add("text-slate-300");
  });

  const activeTab = document.getElementById(`tab-${tabId}`);
  if (activeTab) activeTab.classList.remove("hidden");

  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) {
    activeNav.classList.add("bg-sky-600/30", "text-sky-300", "font-semibold", "border", "border-sky-500/30");
    activeNav.classList.remove("text-slate-300");
  }

  const list = await getAttractions();
  allAttractionsCache = list;

  if (tabId === "dashboard") {
    updateDashboardMetrics(list);
  } else if (tabId === "map-view") {
    renderFullMap(list);
  } else if (tabId === "register") {
    if (!map) {
      setTimeout(initRegisterMap, 100);
    } else {
      setTimeout(() => { map.invalidateSize(); }, 200);
    }
  } else if (tabId === "list") {
    closeDetailView();
    renderAttractionsList(list);
  } else if (tabId === "stats") {
    renderStatistics(list);
  }
}

// 3. DASHBOARD METRICS
function updateDashboardMetrics(list) {
  const totalElem = document.getElementById("metric-total");
  if (totalElem) totalElem.innerText = list.length;

  const depts = new Set(list.map(item => item.department).filter(Boolean));
  const deptsElem = document.getElementById("metric-depts");
  if (deptsElem) deptsElem.innerText = depts.size;
}

// 4. MAPS
function renderFullMap(list) {
  if (!fullMap) {
    fullMap = L.map("fullMap").setView([-16.2902, -63.5887], 5);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(fullMap);
  }

  setTimeout(() => { fullMap.invalidateSize(); }, 200);

  fullMapMarkers.forEach(m => fullMap.removeLayer(m));
  fullMapMarkers = [];

  list.forEach(item => {
    if (item.gps && item.gps.includes(",")) {
      const [lat, lng] = item.gps.split(",").map(n => parseFloat(n.trim()));
      if (!isNaN(lat) && !isNaN(lng)) {
        const m = L.marker([lat, lng]).addTo(fullMap);
        m.bindPopup(`
          <div style="font-size:12px; font-family: sans-serif;">
            <b style="color:#0284c7; font-size: 14px;">${item.name}</b><br>
            <span style="color: #64748b;">${item.type || 'Atracción'}</span><br>
            <b>Ubicación:</b> ${item.municipality || ""}, ${item.department || ""}<br>
            ${item.photo ? `<img src="${item.photo}" style="width:100%; max-height:80px; object-fit:cover; margin-top:5px; border-radius:6px;">` : ''}
          </div>
        `);
        fullMapMarkers.push(m);
      }
    }
  });
}

function initRegisterMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;

  map = L.map("map").setView([-16.2902, -63.5887], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

  map.on("click", (e) => {
    setMapMarker(e.latlng);
  });

  setTimeout(() => { map.invalidateSize(); }, 300);
}

function setMapMarker(latlng) {
  const gpsInput = document.getElementById("gps");
  if (gpsInput) gpsInput.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
  
  if (marker) {
    marker.setLatLng(latlng);
  } else {
    marker = L.marker(latlng).addTo(map);
  }
}

function setupGeolocateButton() {
  const btn = document.getElementById("btnGeolocate");
  if (!btn) return;

  btn.addEventListener("click", () => {
    if ("geolocation" in navigator) {
      btn.innerText = "⌛ Obteniendo GPS...";
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const latlng = L.latLng(lat, lng);
          if (map) {
            map.setView(latlng, 14);
            setMapMarker(latlng);
          }
          btn.innerText = "📍 Usar GPS del dispositivo";
        },
        () => {
          alert("No se pudo obtener la ubicación GPS.");
          btn.innerText = "📍 Usar GPS del dispositivo";
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      alert("El dispositivo no soporta GPS.");
    }
  });
}

// 5. MUNICIPALITY SELECTOR & PHOTO PREVIEW
function setupDepartmentChangeListener() {
  const deptSelect = document.getElementById("department");
  const muniSelect = document.getElementById("municipality");

  if (!deptSelect || !muniSelect) return;

  deptSelect.addEventListener("change", (e) => {
    const selectedDept = e.target.value.trim();
    muniSelect.innerHTML = '<option value="">Selecciona un Municipio...</option>';

    if (selectedDept && municipiosPorDepartamento[selectedDept]) {
      muniSelect.disabled = false;
      municipiosPorDepartamento[selectedDept].forEach(muni => {
        const option = document.createElement("option");
        option.value = muni;
        option.textContent = muni;
        muniSelect.appendChild(option);
      });
    } else {
      muniSelect.disabled = true;
      muniSelect.innerHTML = '<option value="">Primero selecciona un departamento</option>';
    }
  });
}

function setupPhotoPreview() {
  const photoInput = document.getElementById("photo");
  const preview = document.getElementById("photoPreview");

  if (!photoInput || !preview) return;

  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.src = e.target.result;
        preview.dataset.currentSrc = e.target.result;
        preview.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    }
  });
}

// 6. GUARDAR O EDITAR REGISTRO
const form = document.getElementById("attractionForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const btn = document.getElementById("btnSubmit");
    btn.innerText = "⌛ Guardando...";
    btn.disabled = true;

    try {
      const photoInput = document.getElementById("photo");
      let photoBase64 = document.getElementById("photoPreview")?.dataset?.currentSrc || "";

      if (photoInput.files && photoInput.files[0]) {
        photoBase64 = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(photoInput.files[0]);
        });
      }

      const data = {
        attractionId: document.getElementById("attractionId").value,
        name: document.getElementById("name").value,
        type: document.getElementById("type").value,
        department: document.getElementById("department").value,
        municipality: document.getElementById("municipality").value,
        location: document.getElementById("location").value,
        gps: document.getElementById("gps").value,
        period: document.getElementById("period").value,
        openingHours: document.getElementById("openingHours").value,
        admissionFee: document.getElementById("admissionFee").value,
        accessibility: document.getElementById("accessibility").value,
        contact: document.getElementById("contact").value,
        photo: photoBase64,
        qrCode: document.getElementById("qrCode").value,
        services: document.getElementById("services").value,
        description: document.getElementById("description").value,
        updatedAt: new Date().toISOString()
      };

      if (currentEditingId) {
        await db.collection("attractions").doc(currentEditingId).update(data);
        alert("¡Atracción actualizada con éxito!");
        currentEditingId = null;
      } else {
        data.createdAt = new Date().toISOString();
        data.ownerId = currentUserId; // Guarda la autoría
        await db.collection("attractions").add(data);
        alert("¡Atracción registrada con éxito!");
      }

      resetForm();
      switchTab("list");
    } catch (error) {
      console.error("Error al guardar: ", error);
      alert("Error al guardar: " + error.message);
    } finally {
      btn.innerText = "💾 Guardar Atracción";
      btn.disabled = false;
    }
  });
}

function resetForm() {
  const form = document.getElementById("attractionForm");
  if (form) form.reset();
  
  currentEditingId = null;
  const preview = document.getElementById("photoPreview");
  if (preview) {
    preview.classList.add("hidden");
    delete preview.dataset.currentSrc;
  }

  const muniSelect = document.getElementById("municipality");
  if (muniSelect) {
    muniSelect.disabled = true;
    muniSelect.innerHTML = '<option value="">Primero selecciona un departamento</option>';
  }

  if (marker && map) {
    map.removeLayer(marker);
    marker = null;
  }

  const btnSubmit = document.getElementById("btnSubmit");
  if (btnSubmit) btnSubmit.innerText = "💾 Guardar Atracción";
}

// 7. LISTA DE ATRACCIONES (BUSCADOR + TARJETAS LIMPIAS)
function renderAttractionsList(list) {
  const container = document.getElementById("attractionsList");
  const searchInput = document.getElementById("searchBar");
  if (!container) return;

  if (searchInput && !searchInput.dataset.listening) {
    searchInput.dataset.listening = "true";
    searchInput.addEventListener("input", (e) => {
      const query = e.target.value.toLowerCase().trim();
      const filtered = allAttractionsCache.filter(item => 
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.municipality && item.municipality.toLowerCase().includes(query)) ||
        (item.type && item.type.toLowerCase().includes(query))
      );
      displayCards(filtered);
    });
  }

  displayCards(list);
}

function displayCards(list) {
  const container = document.getElementById("attractionsList");
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-white rounded-2xl border border-slate-200">
        <p class="text-4xl mb-2">📂</p>
        <p class="text-slate-500 font-medium">No se encontraron atracciones.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(item => `
    <div onclick="openDetailView('${item.id}')" class="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition cursor-pointer overflow-hidden flex flex-col justify-between">
      <div>
        <div class="h-44 w-full bg-slate-100 relative overflow-hidden">
          ${item.photo 
            ? `<img src="${item.photo}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" alt="${item.name}">` 
            : `<div class="w-full h-full flex items-center justify-center text-slate-400 text-xs">Sin Fotografía</div>`}
          ${item.type ? `<span class="absolute top-3 right-3 bg-slate-900/70 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase">${item.type}</span>` : ''}
        </div>
        <div class="p-4">
          <h3 class="text-lg font-bold text-slate-800 group-hover:text-sky-600 transition line-clamp-1">${item.name}</h3>
          <p class="text-xs text-slate-400 mt-1">📍 ${item.municipality || 'N/A'}, ${item.department || 'N/A'}</p>
        </div>
      </div>
    </div>
  `).join("");
}

// 8. VISTA DETALLADA AL HACER CLIC
function openDetailView(id) {
  const item = allAttractionsCache.find(a => a.id === id);
  if (!item) return;

  const mainView = document.getElementById("catalogMainView");
  const detailView = document.getElementById("attractionDetailView");
  const detailContent = document.getElementById("detailContent");

  const isOwner = item.ownerId === currentUserId;

  detailContent.innerHTML = `
    <div class="space-y-4">
      ${item.photo ? `<img src="${item.photo}" class="w-full max-h-80 object-cover rounded-2xl border border-slate-200" alt="${item.name}">` : ''}
      
      <div class="flex justify-between items-start gap-4">
        <div>
          <span class="bg-sky-100 text-sky-800 text-xs font-bold px-3 py-1 rounded-full uppercase">${item.attractionId || 'AT-000'}</span>
          <h2 class="text-3xl font-extrabold text-slate-900 mt-2">${item.name}</h2>
          <p class="text-sm text-slate-500 mt-1">📍 ${item.municipality || 'N/A'}, ${item.department || 'N/A'} ${item.location ? `— ${item.location}` : ''}</p>
        </div>

        ${isOwner ? `
          <div class="flex gap-2">
            <button onclick="editAttraction('${item.id}')" class="bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold px-3 py-2 rounded-xl transition">
              ✏️ Editar
            </button>
            <button onclick="deleteAttraction('${item.id}')" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-2 rounded-xl transition">
              🗑️ Eliminar
            </button>
          </div>
        ` : ''}
      </div>

      <p class="text-slate-700 text-base leading-relaxed">${item.description || 'Sin descripción detallada.'}</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100 text-slate-700">
        <div><b>Tipo:</b> ${item.type || 'N/A'}</div>
        <div><b>Época Histórica:</b> ${item.period || 'N/A'}</div>
        <div>⏰ <b>Horarios:</b> ${item.openingHours || 'N/A'}</div>
        <div>💰 <b>Costo:</b> ${item.admissionFee || 'N/A'}</div>
        <div>♿ <b>Accesibilidad:</b> ${item.accessibility || 'N/A'}</div>
        <div>📞 <b>Contacto:</b> ${item.contact || 'N/A'}</div>
        <div>🛠️ <b>Servicios:</b> ${item.services || 'N/A'}</div>
        <div>🌐 <b>GPS:</b> ${item.gps || 'N/A'}</div>
      </div>
    </div>
  `;

  mainView.classList.add("hidden");
  detailView.classList.remove("hidden");
}

function closeDetailView() {
  const mainView = document.getElementById("catalogMainView");
  const detailView = document.getElementById("attractionDetailView");
  if (mainView) mainView.classList.remove("hidden");
  if (detailView) detailView.classList.add("hidden");
}

// 9. EDICIÓN
function editAttraction(id) {
  const item = allAttractionsCache.find(a => a.id === id);
  if (!item) return;

  if (item.ownerId !== currentUserId) {
    alert("Solo la persona que registró este sitio puede editarlo.");
    return;
  }

  currentEditingId = id;

  document.getElementById("attractionId").value = item.attractionId || "";
  document.getElementById("name").value = item.name || "";
  document.getElementById("type").value = item.type || "";
  document.getElementById("department").value = item.department || "";
  
  const deptSelect = document.getElementById("department");
  deptSelect.dispatchEvent(new Event("change"));
  
  document.getElementById("municipality").value = item.municipality || "";
  document.getElementById("location").value = item.location || "";
  document.getElementById("gps").value = item.gps || "";
  document.getElementById("period").value = item.period || "";
  document.getElementById("openingHours").value = item.openingHours || "";
  document.getElementById("admissionFee").value = item.admissionFee || "";
  document.getElementById("accessibility").value = item.accessibility || "";
  document.getElementById("contact").value = item.contact || "";
  document.getElementById("qrCode").value = item.qrCode || "";
  document.getElementById("services").value = item.services || "";
  document.getElementById("description").value = item.description || "";

  if (item.photo) {
    const preview = document.getElementById("photoPreview");
    preview.src = item.photo;
    preview.dataset.currentSrc = item.photo;
    preview.classList.remove("hidden");
  }

  closeDetailView();
  switchTab("register");
  document.getElementById("btnSubmit").innerText = "🔄 Actualizar Atracción";
}

async function deleteAttraction(id) {
  const item = allAttractionsCache.find(a => a.id === id);
  if (item && item.ownerId !== currentUserId) {
    alert("Solo la persona que registró este sitio puede eliminarlo.");
    return;
  }

  if (confirm("¿Estás seguro de que deseas eliminar esta atracción?")) {
    await db.collection("attractions").doc(id).delete();
    closeDetailView();
  }
}

// 10. ESTADÍSTICAS
function renderStatistics(list) {
  const deptCounts = {};
  const typeCounts = {};

  list.forEach(item => {
    if (item.department) {
      deptCounts[item.department] = (deptCounts[item.department] || 0) + 1;
    }
    if (item.type) {
      typeCounts[item.type] = (typeCounts[item.type] || 0) + 1;
    }
  });

  const ctxDept = document.getElementById("chartDept");
  if (ctxDept && typeof Chart !== "undefined") {
    if (chartDeptInstance) chartDeptInstance.destroy();
    chartDeptInstance = new Chart(ctxDept.getContext("2d"), {
      type: "bar",
      data: {
        labels: Object.keys(deptCounts),
        datasets: [{
          label: "Atracciones",
          data: Object.values(deptCounts),
          backgroundColor: "#0284c7",
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }
      }
    });
  }

  const ctxType = document.getElementById("chartType");
  if (ctxType && typeof Chart !== "undefined") {
    if (chartTypeInstance) chartTypeInstance.destroy();
    chartTypeInstance = new Chart(ctxType.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: Object.keys(typeCounts),
        datasets: [{
          data: Object.values(typeCounts),
          backgroundColor: ["#0284c7", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#64748b"]
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }
}
