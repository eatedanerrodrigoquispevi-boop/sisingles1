// Municipios por Departamento en Bolivia
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

// Variables globales para mapas y gráficos
let fullMap = null;
let fullMapMarkers = [];
let map = null;
let marker = null;
let chartDeptInstance = null;
let chartTypeInstance = null;

// 1. INICIALIZACIÓN
document.addEventListener("DOMContentLoaded", () => {
  setupDepartmentChangeListener();
  setupPhotoPreview();
  setupGeolocateButton();

  // Escuchador en tiempo real de Firebase
  if (typeof db !== "undefined") {
    db.collection("attractions").onSnapshot((snapshot) => {
      const attractions = [];
      snapshot.forEach(doc => {
        attractions.push({ id: doc.id, ...doc.data() });
      });

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

  // Cargar pestaña por defecto
  switchTab("dashboard");
});

// Obtener datos
async function getAttractions() {
  if (typeof db === "undefined") return [];
  try {
    const snapshot = await db.collection("attractions").get();
    const list = [];
    snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  } catch(e) {
    console.error(e);
    return [];
  }
}

// 2. NAVEGACIÓN Y PESTAÑAS
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
    renderAttractionsList(list);
  } else if (tabId === "stats") {
    renderStatistics(list);
  }
}

// 3. MÉTRICAS
function updateDashboardMetrics(list) {
  const totalElem = document.getElementById("metric-total");
  if (totalElem) totalElem.innerText = list.length;

  const depts = new Set(list.map(item => item.department).filter(Boolean));
  const deptsElem = document.getElementById("metric-depts");
  if (deptsElem) deptsElem.innerText = depts.size;
}

// 4. MAPA COMPLETO
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

// 5. MAPA DE REGISTRO
function initRegisterMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;

  map = L.map("map").setView([-16.2902, -63.5887], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

  if (L.Control && L.Control.geocoder) {
    L.Control.geocoder({ defaultMarkGeocode: false })
    .on('markgeocode', function(e) {
      const bbox = e.geocode.bbox;
      const poly = L.polygon([
        bbox.getSouthEast(), bbox.getNorthEast(), bbox.getNorthWest(), bbox.getSouthWest()
      ]);
      map.fitBounds(poly.getBounds());
      setMapMarker(e.geocode.center);
    })
    .addTo(map);
  }

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
      btn.innerText = "⌛ Obteniendo ubicación...";
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const latlng = L.latLng(lat, lng);
          if (map) {
            map.setView(latlng, 14);
            setMapMarker(latlng);
          }
          btn.innerText = "📍 Usa mi ubicación actual";
        },
        () => {
          alert("No se pudo obtener tu ubicación actual.");
          btn.innerText = "📍 Usa mi ubicación actual";
        }
      );
    } else {
      alert("Tu navegador no soporta geolocalización.");
    }
  });
}

// 6. SELECTOR DINÁMICO DE MUNICIPIOS
function setupDepartmentChangeListener() {
  const deptSelect = document.getElementById("department");
  const muniSelect = document.getElementById("municipality");

  if (!deptSelect || !muniSelect) return;

  deptSelect.addEventListener("change", (e) => {
    const selectedDept = e.target.value.trim();
    muniSelect.innerHTML = '<option value="">Seleccione un Municipio...</option>';

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
      muniSelect.innerHTML = '<option value="">Primero seleccione un departamento</option>';
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
        preview.classList.remove("hidden");
      };
      reader.readAsDataURL(file);
    } else {
      preview.src = "";
      preview.classList.add("hidden");
    }
  });
}

// 7. GUARDAR EN FIREBASE
const form = document.getElementById("attractionForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const btn = document.getElementById("btnSubmit");
    btn.innerText = "⌛ Guardando en la nube...";
    btn.disabled = true;

    try {
      const photoInput = document.getElementById("photo");
      let photoBase64 = "";

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
        createdAt: new Date().toISOString()
      };

      await db.collection("attractions").add(data);

      resetForm();
      alert("¡Atracción registrada con éxito en la base de datos!");
      switchTab("list");
    } catch (error) {
      console.error("Error al guardar: ", error);
      alert("Error al guardar: " + error.message);
    } finally {
      btn.innerText = "💾 Guardar en la Base de Datos";
      btn.disabled = false;
    }
  });
}

function resetForm() {
  const form = document.getElementById("attractionForm");
  if (form) form.reset();
  
  const preview = document.getElementById("photoPreview");
  if (preview) preview.classList.add("hidden");

  const muniSelect = document.getElementById("municipality");
  if (muniSelect) {
    muniSelect.disabled = true;
    muniSelect.innerHTML = '<option value="">Primero seleccione un departamento</option>';
  }

  if (marker && map) {
    map.removeLayer(marker);
    marker = null;
  }
}

// 8. LISTA DE ATRACCIONES
function renderAttractionsList(list) {
  const container = document.getElementById("attractionsList");
  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = `
      <div class="md:col-span-2 text-center py-12 bg-white rounded-2xl border border-slate-200">
        <p class="text-4xl mb-2">📂</p>
        <p class="text-slate-500 font-medium">Aún no hay atracciones registradas en la base de datos.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(item => `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between">
      <div>
        ${item.photo ? `<img src="${item.photo}" class="w-full h-48 object-cover" alt="${item.name}">` : `<div class="w-full h-32 bg-slate-100 flex items-center justify-center text-slate-400 text-sm">Sin fotografía</div>`}
        
        <div class="p-6 space-y-3">
          <div class="flex justify-between items-start gap-2">
            <div>
              <span class="bg-sky-100 text-sky-800 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">${item.attractionId || 'AT-000'}</span>
              <h3 class="text-xl font-bold text-slate-800 mt-1">${item.name}</h3>
            </div>
            <span class="bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-200 shrink-0">${item.type || 'General'}</span>
          </div>

          <p class="text-xs text-slate-500 font-medium">📍 ${item.municipality || 'N/A'}, ${item.department || 'N/A'} ${item.location ? `— ${item.location}` : ''}</p>
          
          <p class="text-sm text-slate-600 line-clamp-3">${item.description || 'Sin descripción disponible.'}</p>

          <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100 text-slate-600">
            <div>⏰ <b>Horario:</b> ${item.openingHours || 'N/A'}</div>
            <div>💰 <b>Precio:</b> ${item.admissionFee || 'N/A'}</div>
            <div>♿ <b>Acceso:</b> ${item.accessibility || 'N/A'}</div>
            <div>📞 <b>Contacto:</b> ${item.contact || 'N/A'}</div>
          </div>
        </div>
      </div>

      <div class="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
        <span class="text-xs font-mono text-slate-400">${item.gps || 'Sin GPS'}</span>
        <button onclick="deleteAttraction('${item.id}')" class="text-xs bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200 font-semibold px-3 py-1.5 rounded-lg transition">
          🗑️ Eliminar
        </button>
      </div>
    </div>
  `).join("");
}

async function deleteAttraction(id) {
  if (confirm("¿Estás seguro de eliminar este registro de la nube?")) {
    await db.collection("attractions").doc(id).delete();
  }
}

// 9. ESTADÍSTICAS
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
  if (ctxDept) {
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
  if (ctxType) {
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
