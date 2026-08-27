const { useState, useEffect, useCallback, useRef } = React;

const STORAGE_KEY = "the2ndcloset_ledger";
const SYNC_KEY = "the2ndcloset_sync";
const CLOUD_KEY = "the2ndcloset_cloudinary";
const PROFILE_KEY = "the2ndcloset_profile";
const MARGIN_KEY = "the2ndcloset_margin";
const POLL_MS = 15000;
const STAR_PATH = "M50 2 L58 40 L98 50 L58 60 L50 98 L42 60 L2 50 L42 40 Z";
const LOGO_SRC = "logo.png";
const CATEGORIAS = ["Gorras", "Camperas", "Remeras", "Pantalones", "Calzado", "Accesorios", "Otros"];
const USUARIOS_DEFAULT = ["Thiago", "Giane"];
const ENTREGAS_SUGERIDAS = ["Plaza San Isidro Labrador (Saavedra)", "Plaza San Martín (Escobar)"];
const METODOS_PAGO = ["Efectivo", "Transferencia"];

function fmtMoney(n){
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(Math.round(n)).toLocaleString("es-AR");
}
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtDate(iso){
  if (!iso) return "";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
  } catch (e) { return iso; }
}
function monthLabel(ym){
  try {
    const [y,m] = ym.split("-");
    const d = new Date(parseInt(y), parseInt(m)-1, 1);
    return d.toLocaleDateString("es-AR", { month: "short", year: "2-digit" });
  } catch (e) { return ym; }
}

const DEFAULT_DATA = {
  version: 2,
  items: [
    { id: "seed-1", concepto: "5 gorras vintage Realtree", categoria: "Gorras", talle: "", costo: 86000, notas: "incluye $6.000 de envío", foto: null, fechaCompra: todayISO(), estado: "stock", precioVenta: null, fechaVenta: null, cargadoPor: null, reservaHasta: null, comprador: null, entrega: null, metodoPago: null },
    { id: "seed-2", concepto: "Campera de hockey · talle M", categoria: "Camperas", talle: "M", costo: 15000, notas: "", foto: null, fechaCompra: todayISO(), estado: "stock", precioVenta: null, fechaVenta: null, cargadoPor: null, reservaHasta: null, comprador: null, entrega: null, metodoPago: null },
  ],
  gastos: [],
  meta: null,
};

function withDefaults(item){
  return {
    estado: "stock", precioVenta: null, fechaVenta: null, cargadoPor: null,
    reservaHasta: null, comprador: null, entrega: null, metodoPago: null,
    categoria: "", talle: "", notas: "", foto: null, estimadoVenta: null,
    ...item,
  };
}

// migra el formato viejo (array plano de {type, concepto, monto, notas, fecha, foto}) al nuevo modelo por item
function normalizeData(raw){
  if (raw && !Array.isArray(raw) && raw.version === 2) {
    return {
      version: 2,
      items: (raw.items || []).map(withDefaults),
      gastos: (raw.gastos || []).map(g => ({ cargadoPor: null, notas: "", ...g })),
      meta: (typeof raw.meta === "number") ? raw.meta : null,
    };
  }
  if (Array.isArray(raw)) {
    const items = [];
    const gastos = [];
    raw.forEach(e => {
      if (e.type === "gasto") {
        items.push(withDefaults({
          id: e.id, concepto: e.concepto, categoria: "", talle: "",
          costo: e.monto, notas: e.notas || "", foto: e.foto || null,
          fechaCompra: todayISO(), estado: "stock",
        }));
      } else if (e.type === "venta") {
        items.push(withDefaults({
          id: e.id, concepto: e.concepto, categoria: "", talle: "",
          costo: 0, notas: (e.notas ? e.notas + " · " : "") + "venta migrada sin costo de compra vinculado",
          foto: e.foto || null, fechaCompra: todayISO(), estado: "vendido",
          precioVenta: e.monto, fechaVenta: todayISO(),
        }));
      }
    });
    return { version: 2, items, gastos, meta: null };
  }
  return DEFAULT_DATA;
}

function loadLocal(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeData(JSON.parse(raw));
  } catch (e) { console.error(e); }
  return DEFAULT_DATA;
}
function saveLocal(data){
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch (e) { console.error("No se pudo guardar", e); }
}
function loadSyncConfig(){ try { const r = localStorage.getItem(SYNC_KEY); if (r) return JSON.parse(r); } catch(e){} return null; }
function saveSyncConfig(cfg){ try { cfg ? localStorage.setItem(SYNC_KEY, JSON.stringify(cfg)) : localStorage.removeItem(SYNC_KEY); } catch(e){} }
function loadCloudConfig(){ try { const r = localStorage.getItem(CLOUD_KEY); if (r) return JSON.parse(r); } catch(e){} return null; }
function saveCloudConfig(cfg){ try { cfg ? localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg)) : localStorage.removeItem(CLOUD_KEY); } catch(e){} }
function loadProfile(){ try { return localStorage.getItem(PROFILE_KEY) || null; } catch(e){ return null; } }
function saveProfile(name){ try { name ? localStorage.setItem(PROFILE_KEY, name) : localStorage.removeItem(PROFILE_KEY); } catch(e){} }
function loadMargin(){ try { const r = localStorage.getItem(MARGIN_KEY); return r ? parseFloat(r) : 2.5; } catch(e){ return 2.5; } }
function saveMargin(v){ try { localStorage.setItem(MARGIN_KEY, String(v)); } catch(e){} }

async function fetchRemote(cfg){
  const res = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}/latest`, { headers: { "X-Access-Key": cfg.accessKey } });
  if (!res.ok) throw new Error("No se pudo leer (" + res.status + ")");
  const data = await res.json();
  return normalizeData(data.record);
}
async function pushRemote(cfg, data){
  const res = await fetch(`https://api.jsonbin.io/v3/b/${cfg.binId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Access-Key": cfg.accessKey },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("No se pudo guardar en la nube (" + res.status + ")");
}

function resizeImage(file, maxWidth = 900, quality = 0.7){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadToCloudinary(cloudCfg, dataUrl){
  const form = new FormData();
  form.append("file", dataUrl);
  form.append("upload_preset", cloudCfg.uploadPreset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudCfg.cloudName}/image/upload`, { method: "POST", body: form });
  if (!res.ok) { const msg = await res.text().catch(()=> ""); throw new Error("No se pudo subir la foto (" + res.status + ") " + msg); }
  const data = await res.json();
  return data.secure_url;
}
async function processFotoFile(file, cloudCfg){
  const dataUrl = await resizeImage(file);
  if (cloudCfg) return await uploadToCloudinary(cloudCfg, dataUrl);
  return dataUrl;
}

function computeStats(data){
  const items = data.items, gastos = data.gastos;
  const costoMercaderia = items.reduce((s,i)=>s+i.costo,0);
  const gastosGenerales = gastos.reduce((s,g)=>s+g.costo,0);
  const vendidos = items.filter(i=>i.estado==="vendido");
  const enStock = items.filter(i=>i.estado==="stock");
  const reservados = items.filter(i=>i.estado==="reservado");
  const ventasTotal = vendidos.reduce((s,i)=>s+(i.precioVenta||0),0);
  const costoVendidos = vendidos.reduce((s,i)=>s+i.costo,0);
  const gananciaNeta = ventasTotal - costoVendidos - gastosGenerales;
  const balance = ventasTotal - costoMercaderia - gastosGenerales;
  const stockValor = enStock.reduce((s,i)=>s+i.costo,0);
  const proyeccionVentaTotal = enStock.reduce((s,i)=>s+(i.estimadoVenta!=null ? i.estimadoVenta : i.costo*2),0);
  const proyeccionGanancia = proyeccionVentaTotal - stockValor;
  const totalInvertido = costoMercaderia + gastosGenerales;
  const roiPct = totalInvertido > 0 ? Math.round((ventasTotal / totalInvertido) * 100) : 0;

  const dias = vendidos.filter(i=>i.fechaCompra && i.fechaVenta).map(i=>{
    const d1 = new Date(i.fechaCompra), d2 = new Date(i.fechaVenta);
    return Math.max(0, Math.round((d2-d1)/(1000*60*60*24)));
  });
  const tiempoPromedio = dias.length ? Math.round(dias.reduce((a,b)=>a+b,0)/dias.length) : null;

  const rentables = vendidos.map(i=>({...i, ganancia: (i.precioVenta||0)-i.costo})).sort((a,b)=>b.ganancia-a.ganancia).slice(0,5);

  const catCount = {};
  vendidos.forEach(i=>{ const c = i.categoria || "Sin categoría"; catCount[c]=(catCount[c]||0)+1; });
  const catRanking = Object.entries(catCount).sort((a,b)=>b[1]-a[1]);

  const monthMap = {};
  items.forEach(i=>{
    const mc = (i.fechaCompra||"").slice(0,7);
    if (mc) { monthMap[mc] = monthMap[mc] || {ingresos:0,gastos:0}; monthMap[mc].gastos += i.costo; }
    if (i.estado==="vendido" && i.fechaVenta) {
      const mv = i.fechaVenta.slice(0,7);
      monthMap[mv] = monthMap[mv] || {ingresos:0,gastos:0};
      monthMap[mv].ingresos += (i.precioVenta||0);
    }
  });
  gastos.forEach(g=>{
    const mg = (g.fecha||"").slice(0,7);
    if (mg) { monthMap[mg] = monthMap[mg] || {ingresos:0,gastos:0}; monthMap[mg].gastos += g.costo; }
  });
  const months = Object.keys(monthMap).sort();

  return { costoMercaderia, gastosGenerales, ventasTotal, gananciaNeta, balance, stockValor, proyeccionVentaTotal, proyeccionGanancia, roiPct, tiempoPromedio, rentables, catRanking, monthMap, months, enStockCount: enStock.length, vendidosCount: vendidos.length, reservadosCount: reservados.length };
}

function monthNameFull(ym){
  try {
    const [y,m] = ym.split("-");
    const d = new Date(parseInt(y), parseInt(m)-1, 1);
    return d.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  } catch (e) { return ym; }
}

function buildSummaryText(data, stats){
  const ym = todayISO().slice(0,7);
  const mes = stats.monthMap[ym] || { ingresos: 0, gastos: 0 };
  const vendidosMes = data.items.filter(i => i.estado === "vendido" && i.fechaVenta && i.fechaVenta.slice(0,7) === ym);
  const gananciaMes = vendidosMes.reduce((s,i)=>s+((i.precioVenta||0)-i.costo),0) - stats.gastosGenerales;
  const top = vendidosMes.map(i=>({...i, ganancia:(i.precioVenta||0)-i.costo})).sort((a,b)=>b.ganancia-a.ganancia).slice(0,3);

  let txt = `📊 the 2nd closet — resumen de ${monthNameFull(ym)}\n\n`;
  txt += `💰 Ventas del mes: ${fmtMoney(mes.ingresos)}\n`;
  txt += `📈 Ganancia del mes: ${fmtMoney(gananciaMes)}\n`;
  txt += `📦 En stock: ${stats.enStockCount} · Reservadas: ${stats.reservadosCount} · Vendidas (total): ${stats.vendidosCount}\n`;
  if (data.meta) {
    const pct = Math.min(100, Math.round((mes.ingresos / data.meta) * 100));
    txt += `🎯 Meta del mes: ${fmtMoney(data.meta)} (${pct}% alcanzado)\n`;
  }
  if (top.length) {
    txt += `\n🏆 Top prendas del mes:\n`;
    top.forEach(i => { txt += `  · ${i.concepto}: +${fmtMoney(i.ganancia)}\n`; });
  }
  txt += `\nthe 2nd closet · bs. as. / zona norte`;
  return txt;
}

function App(){
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("registro");
  const [movType, setMovType] = useState("item");
  const [ventaPrecio, setVentaPrecio] = useState("");
  const [ventaFecha, setVentaFecha] = useState(todayISO());
  const [concepto, setConcepto] = useState("");
  const [categoria, setCategoria] = useState("");
  const [talle, setTalle] = useState("");
  const [costo, setCosto] = useState("");
  const [notas, setNotas] = useState("");
  const [foto, setFoto] = useState(null);
  const [fotoLoading, setFotoLoading] = useState(false);
  const [margen, setMargen] = useState(() => loadMargin());
  const [confirmKey, setConfirmKey] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editGastoId, setEditGastoId] = useState(null);
  const [sellId, setSellId] = useState(null);
  const [sellPrecio, setSellPrecio] = useState("");
  const [sellFecha, setSellFecha] = useState(todayISO());
  const [sellComprador, setSellComprador] = useState("");
  const [sellEntrega, setSellEntrega] = useState("");
  const [sellPago, setSellPago] = useState("");
  const [reserveId, setReserveId] = useState(null);
  const [reserveComprador, setReserveComprador] = useState("");
  const [reserveHasta, setReserveHasta] = useState("");
  const [lightbox, setLightbox] = useState(null);

  const [search, setSearch] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");

  const [profile, setProfile] = useState(() => loadProfile());
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaInput, setMetaInput] = useState("");
  const [shareStatus, setShareStatus] = useState("idle"); // idle | copied

  const [syncCfg, setSyncCfg] = useState(() => loadSyncConfig());
  const [syncStatus, setSyncStatus] = useState("idle");
  const [syncError, setSyncError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [cloudCfg, setCloudCfg] = useState(() => loadCloudConfig());
  const [showPhotoModal, setShowPhotoModal] = useState(false);

  const dataRef = useRef(null);
  const pendingPushRef = useRef(false);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    (async () => {
      if (syncCfg) {
        setSyncStatus("syncing");
        try {
          const remote = await fetchRemote(syncCfg);
          setData(remote); saveLocal(remote); setSyncStatus("ok");
        } catch (e) {
          console.error(e);
          setData(loadLocal()); setSyncStatus("error");
          setSyncError("Sin conexión, mostrando la última copia guardada.");
        }
      } else {
        setData(loadLocal());
      }
    })();
  }, []); // eslint-disable-line

  const pushWithRetry = useCallback(async (next) => {
    if (!syncCfg) return;
    pendingPushRef.current = true;
    setSyncStatus("syncing");
    try {
      await pushRemote(syncCfg, next);
      pendingPushRef.current = false;
      setSyncStatus("ok");
    } catch (e) {
      console.error(e);
      setSyncStatus("error");
      setSyncError("No se pudo guardar en la nube. Probá con una foto más chica o quitala de ese registro.");
    }
  }, [syncCfg]);

  useEffect(() => {
    if (!syncCfg) return;
    const id = setInterval(async () => {
      if (pendingPushRef.current) {
        if (dataRef.current) pushWithRetry(dataRef.current);
        return;
      }
      try {
        const remote = await fetchRemote(syncCfg);
        setData(remote); saveLocal(remote); setSyncStatus("ok");
      } catch (e) { setSyncStatus("error"); }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [syncCfg, pushWithRetry]);

  const persist = useCallback((next) => {
    setData(next);
    saveLocal(next);
    if (syncCfg) pushWithRetry(next);
  }, [syncCfg, pushWithRetry]);

  const manualRefresh = async () => {
    if (!syncCfg) return;
    if (pendingPushRef.current) { pushWithRetry(dataRef.current); return; }
    setSyncStatus("syncing");
    try {
      const remote = await fetchRemote(syncCfg);
      setData(remote); saveLocal(remote); setSyncStatus("ok");
    } catch (e) { setSyncStatus("error"); setSyncError("No se pudo actualizar."); }
  };

  const handleFotoChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setFotoLoading(true);
    try {
      const url = await processFotoFile(file, cloudCfg);
      setFoto(url);
    } catch (err) {
      console.error(err);
      setSyncError("No se pudo subir la foto. Revisá la configuración de fotos (⚙).");
    } finally { setFotoLoading(false); }
  };

  const addMovimiento = () => {
    if (!concepto.trim() || !data) return;
    if (movType === "item") {
      const val = parseFloat(costo);
      if (!val || val <= 0) return;
      const item = {
        id: Date.now().toString(), concepto: concepto.trim(), categoria, talle: talle.trim(),
        costo: val, notas: notas.trim(), foto: foto || null, fechaCompra: todayISO(),
        estado: "stock", precioVenta: null, fechaVenta: null, cargadoPor: profile || null,
        reservaHasta: null, comprador: null, entrega: null, metodoPago: null,
      };
      persist({ ...data, items: [item, ...data.items] });
    } else if (movType === "gasto") {
      const val = parseFloat(costo);
      if (!val || val <= 0) return;
      const gasto = { id: Date.now().toString(), concepto: concepto.trim(), costo: val, notas: notas.trim(), fecha: todayISO(), cargadoPor: profile || null };
      persist({ ...data, gastos: [gasto, ...data.gastos] });
    } else if (movType === "venta") {
      const precio = parseFloat(ventaPrecio);
      if (!precio || precio <= 0) return;
      const costoVal = parseFloat(costo) || 0;
      const fVenta = ventaFecha || todayISO();
      const item = {
        id: Date.now().toString(), concepto: concepto.trim(), categoria, talle: talle.trim(),
        costo: costoVal, notas: notas.trim(), foto: foto || null, fechaCompra: fVenta,
        estado: "vendido", precioVenta: precio, fechaVenta: fVenta, cargadoPor: profile || null,
        reservaHasta: null, comprador: null, entrega: null, metodoPago: null,
      };
      persist({ ...data, items: [item, ...data.items] });
    }
    setConcepto(""); setCategoria(""); setTalle(""); setCosto(""); setNotas(""); setFoto(null);
    setVentaPrecio(""); setVentaFecha(todayISO());
  };

  const removeItem = (id) => { persist({ ...data, items: data.items.filter(i=>i.id!==id) }); setConfirmKey(null); };

  const handleMargenChange = (v) => {
    setMargen(v);
    const num = parseFloat(v);
    if (num > 0) saveMargin(num);
  };

  const saveMeta = () => {
    const val = parseFloat(metaInput);
    if (!val || val <= 0) return;
    persist({ ...data, meta: val });
    setEditingMeta(false);
  };
  const clearMeta = () => {
    persist({ ...data, meta: null });
    setEditingMeta(false);
    setMetaInput("");
  };

  const shareResumen = async () => {
    const text = buildSummaryText(data, computeStats(data));
    if (navigator.share) {
      try { await navigator.share({ text }); } catch (e) { /* cancelado, no pasa nada */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 2000);
    } catch (e) {
      window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
    }
  };

  const saveEdit = (updated) => {
    persist({ ...data, items: data.items.map(i => i.id===updated.id ? updated : i) });
    setEditId(null);
  };
  const removeGasto = (id) => { persist({ ...data, gastos: data.gastos.filter(g=>g.id!==id) }); setConfirmKey(null); };
  const saveEditGasto = (updated) => {
    persist({ ...data, gastos: data.gastos.map(g => g.id===updated.id ? updated : g) });
    setEditGastoId(null);
  };
  const revertItem = (id) => {
    persist({ ...data, items: data.items.map(i => i.id===id ? {...i, estado:"stock", precioVenta:null, fechaVenta:null, reservaHasta:null, comprador:null, entrega:null, metodoPago:null} : i) });
  };
  const cancelReserve = (id) => {
    persist({ ...data, items: data.items.map(i => i.id===id ? {...i, estado:"stock", reservaHasta:null, comprador:null} : i) });
  };
  const confirmReserve = () => {
    if (!reserveHasta) return;
    persist({ ...data, items: data.items.map(i => i.id===reserveId ? {...i, estado:"reservado", reservaHasta: reserveHasta, comprador: reserveComprador.trim() || null} : i) });
    setReserveId(null); setReserveComprador(""); setReserveHasta("");
  };
  const confirmSell = () => {
    const precio = parseFloat(sellPrecio);
    if (!precio || precio <= 0) return;
    persist({ ...data, items: data.items.map(i => i.id===sellId ? {
      ...i, estado:"vendido", precioVenta: precio, fechaVenta: sellFecha,
      comprador: sellComprador.trim() || i.comprador || null,
      entrega: sellEntrega.trim() || null, metodoPago: sellPago || null,
    } : i) });
    setSellId(null); setSellPrecio(""); setSellFecha(todayISO()); setSellComprador(""); setSellEntrega(""); setSellPago("");
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "the2ndcloset-caja.json"; a.click();
    URL.revokeObjectURL(url);
  };

  if (data === null) return <div className="wrap"><div className="loading">Abriendo la caja…</div></div>;

  const stats = computeStats(data);
  const usuariosConocidos = Array.from(new Set([...USUARIOS_DEFAULT, ...data.items.map(i=>i.cargadoPor).filter(Boolean), ...data.gastos.map(g=>g.cargadoPor).filter(Boolean)]));

  const matchesFilters = (i) => {
    if (search.trim() && !i.concepto.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (filtroCategoria && i.categoria !== filtroCategoria) return false;
    if (filtroUsuario && i.cargadoPor !== filtroUsuario) return false;
    return true;
  };
  const itemsFiltrados = data.items.filter(matchesFilters);
  const enStock = itemsFiltrados.filter(i=>i.estado==="stock");
  const reservados = itemsFiltrados.filter(i=>i.estado==="reservado");
  const vendidos = itemsFiltrados.filter(i=>i.estado==="vendido");
  const hayFiltrosActivos = search.trim() || filtroCategoria || filtroEstado || filtroUsuario;
  const mostrarStock = !filtroEstado || filtroEstado === "stock";
  const mostrarReservado = !filtroEstado || filtroEstado === "reservado";
  const mostrarVendido = !filtroEstado || filtroEstado === "vendido";
  const maxMonthVal = Math.max(1, ...stats.months.map(m => Math.max(stats.monthMap[m].ingresos, stats.monthMap[m].gastos)));

  return (
    <div className="wrap">
      {!profile && <ProfileModal current={null} closable={false} onSelect={(name)=>{ saveProfile(name); setProfile(name); }} />}

      <header>
        <img className="logo-cat" src={LOGO_SRC} alt="the 2nd closet" />
        <div className="brand"><h1>the 2nd closet</h1><p>caja · registro</p></div>
        {profile && <button className="profile-pill" title="Cambiar perfil" onClick={()=>setShowProfileModal(true)}>{profile}</button>}
        <button className="sync-btn" title="Sincronización" onClick={() => setShowModal(true)}>⇅</button>
      </header>

      <div className="sync-status">
        <span className={"sync-badge " + (syncCfg ? "on" : "off")}></span>
        {syncCfg ? (syncStatus === "syncing" ? "sincronizando…" : syncStatus === "error" ? syncError : "compartido con tu pareja") : "solo en este dispositivo"}
        {syncCfg && <button onClick={manualRefresh}>actualizar</button>}
        {!syncCfg && <button onClick={() => setShowModal(true)}>activar</button>}
      </div>

      <div className="tabs">
        <button className={tab==="registro"?"active":""} onClick={()=>setTab("registro")}>Registro</button>
        <button className={tab==="stats"?"active":""} onClick={()=>setTab("stats")}>Estadísticas</button>
      </div>

      <div className="summary">
        <div className="stat gastos"><div className="label">Invertido</div><div className="value">{fmtMoney(stats.costoMercaderia + stats.gastosGenerales)}</div></div>
        <div className="stat ventas"><div className="label">Ventas</div><div className="value">{fmtMoney(stats.ventasTotal)}</div></div>
        <div className="stat balance"><div className="label">Balance</div><div className="value">{fmtMoney(stats.balance)}</div></div>
      </div>
      {(stats.costoMercaderia + stats.gastosGenerales) > 0 && (
        <div className="roi">Recuperaste <b>{stats.roiPct}%</b> de lo invertido · <b>{stats.enStockCount}</b> en stock · <b>{stats.reservadosCount}</b> reservadas · <b>{stats.vendidosCount}</b> vendidas</div>
      )}

      {tab === "registro" && (
        <div className="tab-content" key="registro">
          <div className="form-card">
            <div className="toggle">
              <button className={"item" + (movType==="item"?" active":"")} onClick={()=>setMovType("item")}>+ prenda</button>
              <button className={"venta-directa" + (movType==="venta"?" active":"")} onClick={()=>setMovType("venta")}>$ venta directa</button>
              <button className={"gasto" + (movType==="gasto"?" active":"")} onClick={()=>setMovType("gasto")}>− gasto</button>
            </div>

            {movType === "venta" && (
              <p className="hint-text">Para ropa propia que no compraste para revender: la carga directo como vendida, sin pasar por "en stock".</p>
            )}

            <div className="field">
              <label>{movType==="gasto" ? "Concepto" : "Nombre de la prenda"}</label>
              <input type="text" placeholder={movType==="gasto" ? "ej: envío suelto, insumos" : "ej: buzo negro talle M"} value={concepto} onChange={e=>setConcepto(e.target.value)} />
            </div>

            {(movType === "item" || movType === "venta") && (
              <div className="row2">
                <div className="field">
                  <label>Categoría</label>
                  <select value={categoria} onChange={e=>setCategoria(e.target.value)}>
                    <option value="">Sin categoría</option>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Talle (opcional)</label>
                  <input type="text" placeholder="ej: M" value={talle} onChange={e=>setTalle(e.target.value)} />
                </div>
              </div>
            )}

            {movType === "venta" && (
              <div className="row2">
                <div className="field">
                  <label>Precio de venta</label>
                  <input type="number" inputMode="numeric" placeholder="0" value={ventaPrecio} onChange={e=>setVentaPrecio(e.target.value)} />
                </div>
                <div className="field">
                  <label>Fecha de venta</label>
                  <input type="date" value={ventaFecha} onChange={e=>setVentaFecha(e.target.value)} />
                </div>
              </div>
            )}

            <div className="row2">
              <div className="field">
                <label>{movType==="venta" ? "Costo (opcional, dejalo en 0 si no la compraste)" : movType==="item" ? "Costo" : "Monto"}</label>
                <input type="number" inputMode="numeric" placeholder="0" value={costo} onChange={e=>setCosto(e.target.value)} />
              </div>
              <div className="field">
                <label>Notas (opcional)</label>
                <input type="text" placeholder="detalle extra" value={notas} onChange={e=>setNotas(e.target.value)} />
              </div>
            </div>

            {movType === "item" && costo && parseFloat(costo) > 0 && (
              <div className="margin-calc">
                <div className="margin-calc-row">
                  <span>margen sugerido</span>
                  <input type="number" step="0.1" min="1" value={margen} onChange={e=>handleMargenChange(e.target.value)} />
                  <span>x</span>
                </div>
                <div className="margin-calc-result">
                  precio sugerido: <b>{fmtMoney(parseFloat(costo) * (parseFloat(margen) || 1))}</b>
                </div>
              </div>
            )}

            {(movType === "item" || movType === "venta") && (
              <div className="photo-field">
                <div className="photo-field-head">
                  <label>Foto (opcional)</label>
                  <button type="button" className="gear-btn" title="Configurar almacenamiento de fotos" onClick={() => setShowPhotoModal(true)}>⚙</button>
                </div>
                <div className="photo-picker">
                  <label className="pick-btn" htmlFor="foto-input">{fotoLoading ? "procesando…" : foto ? "cambiar foto" : "📷 elegir foto"}</label>
                  <input id="foto-input" type="file" accept="image/*" onChange={handleFotoChange} />
                  {foto && (
                    <div className="photo-preview">
                      <img src={foto} alt="preview" />
                      <button className="clear" onClick={() => setFoto(null)} title="Quitar foto">×</button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button className="add-btn" onClick={addMovimiento}>{movType==="item" ? "Agregar prenda" : movType==="venta" ? "Agregar venta" : "Agregar gasto"}</button>
          </div>

          <div className="filter-bar">
            <input type="text" className="search-input" placeholder="🔍 buscar por nombre…" value={search} onChange={e=>setSearch(e.target.value)} />
            <div className="filter-row">
              <select value={filtroCategoria} onChange={e=>setFiltroCategoria(e.target.value)}>
                <option value="">Todas las categorías</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="stock">En stock</option>
                <option value="reservado">Reservadas</option>
                <option value="vendido">Vendidas</option>
              </select>
              <select value={filtroUsuario} onChange={e=>setFiltroUsuario(e.target.value)}>
                <option value="">Quien sea</option>
                {usuariosConocidos.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              {hayFiltrosActivos && <button className="clear-filters" onClick={()=>{setSearch("");setFiltroCategoria("");setFiltroEstado("");setFiltroUsuario("");}}>limpiar</button>}
            </div>
          </div>

          {mostrarStock && (
          <React.Fragment>
          <div className="section-title"><svg className="mini-star" viewBox="0 0 100 100"><path d={STAR_PATH}/></svg>En stock ({enStock.length})</div>
          <div className="paper">
            {enStock.length === 0 && <div className="empty">{hayFiltrosActivos ? "Nada coincide con el filtro" : "Sin prendas en stock"}</div>}
            {enStock.map(i => (
              <div className="item-row" key={i.id}>
                <div className="item-left">
                  {i.foto && <img className="entry-thumb" src={i.foto} alt={i.concepto} onClick={()=>setLightbox(i.foto)} />}
                  <div>
                    <div className="concepto">{i.concepto}</div>
                    {(i.categoria || i.talle) && (
                      <div>
                        {i.categoria && <span className="badge cat">{i.categoria}</span>}
                        {i.talle && <span className="badge cat">talle {i.talle}</span>}
                      </div>
                    )}
                    {i.notas && <div className="notas">{i.notas}</div>}
                    <div className="meta">comprado {fmtDate(i.fechaCompra)}{i.cargadoPor ? " · cargó " + i.cargadoPor : ""}</div>
                  </div>
                </div>
                <div className="item-right">
                  <div className="monto gasto">{fmtMoney(i.costo)}</div>
                  {confirmKey === "item:"+i.id ? (
                    <div className="confirm">
                      <button className="yes" onClick={()=>removeItem(i.id)}>borrar</button>
                      <button className="no" onClick={()=>setConfirmKey(null)}>volver</button>
                    </div>
                  ) : (
                    <div className="item-actions">
                      <button className="sell" onClick={()=>{setSellId(i.id); setSellPrecio(""); setSellFecha(todayISO()); setSellComprador(i.comprador||""); setSellEntrega(""); setSellPago("");}}>marcar vendido</button>
                      <button className="reserve" onClick={()=>{setReserveId(i.id); setReserveComprador(""); setReserveHasta("");}}>reservar</button>
                      <button className="edit" onClick={()=>setEditId(i.id)}>editar</button>
                      <button className="del" onClick={()=>setConfirmKey("item:"+i.id)}>quitar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </React.Fragment>
          )}

          {mostrarReservado && (
          <React.Fragment>
          <div className="section-title"><svg className="mini-star" viewBox="0 0 100 100"><path d={STAR_PATH}/></svg>Reservadas ({reservados.length})</div>
          <div className="paper">
            {reservados.length === 0 && <div className="empty">{hayFiltrosActivos ? "Nada coincide con el filtro" : "Sin reservas activas"}</div>}
            {reservados.map(i => (
              <div className="item-row" key={i.id}>
                <div className="item-left">
                  {i.foto && <img className="entry-thumb" src={i.foto} alt={i.concepto} onClick={()=>setLightbox(i.foto)} />}
                  <div>
                    <div className="concepto">{i.concepto}</div>
                    {i.categoria && <span className="badge cat">{i.categoria}</span>}
                    <span className="badge reservado">reservada</span>
                    <div className="meta">hasta {fmtDate(i.reservaHasta)}{i.comprador ? " · " + i.comprador : ""}</div>
                    {i.cargadoPor && <div className="meta">cargó {i.cargadoPor}</div>}
                  </div>
                </div>
                <div className="item-right">
                  <div className="monto gasto">{fmtMoney(i.costo)}</div>
                  {confirmKey === "item:"+i.id ? (
                    <div className="confirm">
                      <button className="yes" onClick={()=>removeItem(i.id)}>borrar</button>
                      <button className="no" onClick={()=>setConfirmKey(null)}>volver</button>
                    </div>
                  ) : (
                    <div className="item-actions">
                      <button className="sell" onClick={()=>{setSellId(i.id); setSellPrecio(""); setSellFecha(todayISO()); setSellComprador(i.comprador||""); setSellEntrega(""); setSellPago("");}}>confirmar venta</button>
                      <button className="revert" onClick={()=>cancelReserve(i.id)}>cancelar reserva</button>
                      <button className="edit" onClick={()=>setEditId(i.id)}>editar</button>
                      <button className="del" onClick={()=>setConfirmKey("item:"+i.id)}>quitar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          </React.Fragment>
          )}

          {mostrarVendido && (
          <React.Fragment>
          <div className="section-title"><svg className="mini-star" viewBox="0 0 100 100"><path d={STAR_PATH}/></svg>Vendidas ({vendidos.length})</div>
          <div className="paper">
            {vendidos.length === 0 && <div className="empty">{hayFiltrosActivos ? "Nada coincide con el filtro" : "Todavía no vendiste nada"}</div>}
            {vendidos.map(i => {
              const ganancia = (i.precioVenta||0) - i.costo;
              return (
                <div className="item-row" key={i.id}>
                  <div className="item-left">
                    {i.foto && <img className="entry-thumb" src={i.foto} alt={i.concepto} onClick={()=>setLightbox(i.foto)} />}
                    <div>
                      <div className="concepto">{i.concepto}</div>
                      {i.categoria && <span className="badge cat">{i.categoria}</span>}
                      <div className="meta">vendido {fmtDate(i.fechaVenta)} · costó {fmtMoney(i.costo)}</div>
                      {(i.comprador || i.entrega || i.metodoPago) && (
                        <div className="meta">{[i.comprador, i.entrega, i.metodoPago].filter(Boolean).join(" · ")}</div>
                      )}
                      {i.cargadoPor && <div className="meta">cargó {i.cargadoPor}</div>}
                      <div className={"ganancia " + (ganancia>=0?"pos":"neg")}>{ganancia>=0?"+":""}{fmtMoney(ganancia)} de ganancia</div>
                    </div>
                  </div>
                  <div className="item-right">
                    <div className="monto venta">{fmtMoney(i.precioVenta)}</div>
                    {confirmKey === "item:"+i.id ? (
                      <div className="confirm">
                        <button className="yes" onClick={()=>removeItem(i.id)}>borrar</button>
                        <button className="no" onClick={()=>setConfirmKey(null)}>volver</button>
                      </div>
                    ) : (
                      <div className="item-actions">
                        <button className="revert" onClick={()=>revertItem(i.id)}>volver a stock</button>
                        <button className="edit" onClick={()=>setEditId(i.id)}>editar</button>
                        <button className="del" onClick={()=>setConfirmKey("item:"+i.id)}>quitar</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </React.Fragment>
          )}

          <div className="section-title"><svg className="mini-star" viewBox="0 0 100 100"><path d={STAR_PATH}/></svg>Gastos generales ({data.gastos.length})</div>
          <div className="paper">
            {data.gastos.length === 0 && <div className="empty">Sin gastos generales cargados</div>}
            {data.gastos.map(g => (
              <div className="item-row" key={g.id}>
                <div className="item-left">
                  <div>
                    <div className="concepto">{g.concepto}</div>
                    {g.notas && <div className="notas">{g.notas}</div>}
                    <div className="meta">{fmtDate(g.fecha)}{g.cargadoPor ? " · cargó " + g.cargadoPor : ""}</div>
                  </div>
                </div>
                <div className="item-right">
                  <div className="monto gasto">{fmtMoney(g.costo)}</div>
                  {confirmKey === "gasto:"+g.id ? (
                    <div className="confirm">
                      <button className="yes" onClick={()=>removeGasto(g.id)}>borrar</button>
                      <button className="no" onClick={()=>setConfirmKey(null)}>volver</button>
                    </div>
                  ) : (
                    <div className="item-actions">
                      <button className="edit" onClick={()=>setEditGastoId(g.id)}>editar</button>
                      <button className="del" onClick={()=>setConfirmKey("gasto:"+g.id)}>quitar</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="export-row"><button onClick={exportJSON}>exportar respaldo (.json)</button></div>
        </div>
      )}

      {tab === "stats" && (
        <div className="tab-content" key="stats">
          <div className="chart-card">
            <h3>Meta del mes</h3>
            {(() => {
              const ym = todayISO().slice(0,7);
              const mesVentas = (stats.monthMap[ym] && stats.monthMap[ym].ingresos) || 0;
              if (editingMeta) {
                return (
                  <div>
                    <div className="field">
                      <label>Meta de ventas para {monthNameFull(ym)}</label>
                      <input type="number" inputMode="numeric" placeholder="ej: 200000" value={metaInput} onChange={e=>setMetaInput(e.target.value)} />
                    </div>
                    <div className="modal-actions">
                      <button className="cancel" onClick={()=>setEditingMeta(false)}>Cancelar</button>
                      <button className="save" onClick={saveMeta}>Guardar</button>
                    </div>
                  </div>
                );
              }
              if (!data.meta) {
                return (
                  <div className="empty-stats">
                    Todavía no pusieron una meta este mes.
                    <div style={{marginTop:10}}>
                      <button className="add-btn" style={{width:"auto", padding:"9px 16px"}} onClick={()=>{setMetaInput(""); setEditingMeta(true);}}>Definir meta</button>
                    </div>
                  </div>
                );
              }
              const pct = Math.min(100, Math.round((mesVentas / data.meta) * 100));
              return (
                <div>
                  <div className="meta-row">
                    <span>{fmtMoney(mesVentas)} de {fmtMoney(data.meta)}</span>
                    <button className="edit-meta-btn" onClick={()=>{setMetaInput(String(data.meta)); setEditingMeta(true);}}>editar</button>
                  </div>
                  <div className="meta-bar"><div className="meta-bar-fill" style={{width: pct + "%"}}></div></div>
                  <div className="meta-pct">{pct >= 100 ? "🎉 ¡meta cumplida!" : pct + "% alcanzado"}</div>
                </div>
              );
            })()}
          </div>

          <div className="stats-grid">
            <div className="stat"><div className="label">Ganancia neta</div><div className="value" style={{color: stats.gananciaNeta>=0 ? "#8fae6b" : "#ad2419"}}>{fmtMoney(stats.gananciaNeta)}</div></div>
            <div className="stat"><div className="label">Stock valorizado</div><div className="value" style={{color:"var(--gold)"}}>{fmtMoney(stats.stockValor)}</div></div>
            <div className="stat"><div className="label">Gastos generales</div><div className="value" style={{color:"#ad2419"}}>{fmtMoney(stats.gastosGenerales)}</div></div>
            <div className="stat"><div className="label">Días prom. en stock</div><div className="value" style={{color:"var(--paper)"}}>{stats.tiempoPromedio !== null ? stats.tiempoPromedio + "d" : "—"}</div></div>
          </div>

          <div className="chart-card">
            <h3>Proyección (si vendés todo el stock)</h3>
            {stats.enStockCount === 0 ? (
              <div className="empty-stats">No hay prendas en stock para proyectar.</div>
            ) : (
              <div>
                <div className="meta-row"><span>Costo del stock</span><b>{fmtMoney(stats.stockValor)}</b></div>
                <div className="meta-row"><span>Estimado de venta</span><b style={{color:"var(--gold)"}}>{fmtMoney(stats.proyeccionVentaTotal)}</b></div>
                <div className="meta-row"><span>Ganancia proyectada</span><b style={{color: stats.proyeccionGanancia>=0 ? "#8fae6b" : "#ad2419"}}>{fmtMoney(stats.proyeccionGanancia)}</b></div>
                <div className="meta-pct">Estimado editable por prenda (botón "editar"). Por defecto es 2x el costo.</div>
              </div>
            )}
          </div>

          <div className="chart-card">
            <h3>Ingresos vs. gastos por mes</h3>
            {stats.months.length === 0 ? (
              <div className="empty-stats">Todavía no hay suficientes datos</div>
            ) : (
              <React.Fragment>
                <div className="bars">
                  {stats.months.map(m => {
                    const v = stats.monthMap[m];
                    const hIng = Math.max(2, Math.round((v.ingresos / maxMonthVal) * 90));
                    const hGas = Math.max(2, Math.round((v.gastos / maxMonthVal) * 90));
                    return (
                      <div className="bar-group" key={m}>
                        <div className="bar-pair">
                          <div className="bar ingreso" style={{height: hIng + "px"}} title={fmtMoney(v.ingresos)}></div>
                          <div className="bar gasto" style={{height: hGas + "px"}} title={fmtMoney(v.gastos)}></div>
                        </div>
                        <div className="bar-label">{monthLabel(m)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="legend">
                  <span><span className="dot ingreso"></span>ingresos</span>
                  <span><span className="dot gasto"></span>gastos</span>
                </div>
              </React.Fragment>
            )}
          </div>

          <div className="chart-card">
            <h3>Prendas más rentables</h3>
            {stats.rentables.length === 0 ? <div className="empty-stats">Todavía no vendiste nada</div> : (
              <ul className="rank-list">
                {stats.rentables.map(i => (
                  <li key={i.id}><span className="name">{i.concepto}</span><span className="val" style={{color: i.ganancia>=0 ? "#8fae6b" : "#ad2419"}}>{i.ganancia>=0?"+":""}{fmtMoney(i.ganancia)}</span></li>
                ))}
              </ul>
            )}
          </div>

          <div className="chart-card">
            <h3>Categorías que más venden</h3>
            {stats.catRanking.length === 0 ? <div className="empty-stats">Todavía no hay ventas para rankear</div> : (
              <ul className="rank-list">
                {stats.catRanking.map(([cat, count]) => (
                  <li key={cat}><span className="name">{cat}</span><span className="val">{count} {count===1?"venta":"ventas"}</span></li>
                ))}
              </ul>
            )}
          </div>

          <div className="export-row">
            <button onClick={shareResumen}>{shareStatus === "copied" ? "✓ copiado, pegalo en whatsapp" : "compartir resumen (whatsapp)"}</button>
          </div>
        </div>
      )}

      <div className="stamp-footer">bs. as. / zona norte</div>

      {editId && (() => {
        const item = data.items.find(i=>i.id===editId);
        if (!item) return null;
        return (
          <EditModal
            item={item}
            cloudCfg={cloudCfg}
            onClose={()=>setEditId(null)}
            onSave={saveEdit}
          />
        );
      })()}

      {editGastoId && (() => {
        const gasto = data.gastos.find(g=>g.id===editGastoId);
        if (!gasto) return null;
        return (
          <EditGastoModal
            gasto={gasto}
            onClose={()=>setEditGastoId(null)}
            onSave={saveEditGasto}
          />
        );
      })()}

      {reserveId && (() => {
        const item = data.items.find(i=>i.id===reserveId);
        return (
          <div className="modal-overlay" onClick={()=>setReserveId(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <h2>Reservar prenda</h2>
              <p>{item ? item.concepto : ""}</p>
              <div className="field"><label>Comprador (opcional)</label><input type="text" placeholder="nombre" value={reserveComprador} onChange={e=>setReserveComprador(e.target.value)} /></div>
              <div className="field"><label>Reservada hasta</label><input type="date" value={reserveHasta} onChange={e=>setReserveHasta(e.target.value)} min={todayISO()} /></div>
              <div className="modal-actions">
                <button className="cancel" onClick={()=>setReserveId(null)}>Cancelar</button>
                <button className="save" onClick={confirmReserve}>Reservar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {sellId && (() => {
        const item = data.items.find(i=>i.id===sellId);
        return (
          <div className="modal-overlay" onClick={()=>setSellId(null)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <h2>{item && item.estado === "reservado" ? "Confirmar venta" : "Marcar como vendida"}</h2>
              <p>{item ? item.concepto : ""}</p>
              <div className="field"><label>Precio de venta</label><input type="number" inputMode="numeric" placeholder="0" value={sellPrecio} onChange={e=>setSellPrecio(e.target.value)} /></div>
              <div className="field"><label>Fecha de venta</label><input type="date" value={sellFecha} onChange={e=>setSellFecha(e.target.value)} /></div>
              <div className="field"><label>Comprador (opcional)</label><input type="text" placeholder="nombre" value={sellComprador} onChange={e=>setSellComprador(e.target.value)} /></div>
              <div className="field">
                <label>Punto de entrega (opcional)</label>
                <input type="text" list="entregas-list" placeholder="ej: Plaza San Isidro Labrador" value={sellEntrega} onChange={e=>setSellEntrega(e.target.value)} />
                <datalist id="entregas-list">{ENTREGAS_SUGERIDAS.map(e => <option key={e} value={e} />)}</datalist>
              </div>
              <div className="field">
                <label>Método de pago (opcional)</label>
                <select value={sellPago} onChange={e=>setSellPago(e.target.value)}>
                  <option value="">Sin especificar</option>
                  {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="modal-actions">
                <button className="cancel" onClick={()=>setSellId(null)}>Cancelar</button>
                <button className="save" onClick={confirmSell}>Confirmar venta</button>
              </div>
            </div>
          </div>
        );
      })()}

      {showModal && (
        <SyncModal
          current={syncCfg}
          onClose={() => setShowModal(false)}
          onSave={async (cfg) => {
            setSyncStatus("syncing");
            let remote;
            try { remote = await fetchRemote(cfg); } catch (e) { remote = null; }
            if (!remote) { await pushRemote(cfg, data); remote = data; }
            saveSyncConfig(cfg); setSyncCfg(cfg); setData(remote); saveLocal(remote); setSyncStatus("ok"); setShowModal(false);
          }}
          onDisconnect={() => { saveSyncConfig(null); setSyncCfg(null); setSyncStatus("idle"); setShowModal(false); }}
        />
      )}

      {showPhotoModal && (
        <PhotoModal
          current={cloudCfg}
          onClose={() => setShowPhotoModal(false)}
          onSave={(cfg) => { saveCloudConfig(cfg); setCloudCfg(cfg); setShowPhotoModal(false); }}
          onDisconnect={() => { saveCloudConfig(null); setCloudCfg(null); setShowPhotoModal(false); }}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          current={profile}
          closable={true}
          onSelect={(name) => { saveProfile(name); setProfile(name); setShowProfileModal(false); }}
          onClose={() => setShowProfileModal(false)}
        />
      )}

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <button className="close" onClick={() => setLightbox(null)}>×</button>
          <img src={lightbox} alt="foto ampliada" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function ProfileModal({ current, closable, onSelect, onClose }){
  const [customName, setCustomName] = useState("");
  const handleOverlayClick = () => { if (closable && onClose) onClose(); };
  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>¿Quién sos?</h2>
        <p>Elegí tu nombre para que quede registrado quién carga cada movimiento. Esto no es una contraseña, es solo para llevar orden entre ustedes.</p>
        <div className="profile-options">
          {USUARIOS_DEFAULT.map(name => (
            <button key={name} className={"profile-opt" + (current===name?" active":"")} onClick={()=>onSelect(name)}>{name}</button>
          ))}
        </div>
        <div className="field" style={{marginTop:14}}>
          <label>Otro nombre</label>
          <div style={{display:"flex", gap:8}}>
            <input type="text" placeholder="tu nombre" value={customName} onChange={e=>setCustomName(e.target.value)} />
            <button className="add-btn" style={{width:"auto", padding:"9px 14px"}} onClick={()=>{ if(customName.trim()) onSelect(customName.trim()); }}>Usar</button>
          </div>
        </div>
        {closable && <div className="modal-actions"><button className="cancel" onClick={onClose}>Cancelar</button></div>}
      </div>
    </div>
  );
}

function EditModal({ item, cloudCfg, onClose, onSave }){
  const [concepto, setConcepto] = useState(item.concepto);
  const [categoria, setCategoria] = useState(item.categoria || "");
  const [talle, setTalle] = useState(item.talle || "");
  const [costo, setCosto] = useState(String(item.costo));
  const [estimadoVenta, setEstimadoVenta] = useState(String(item.estimadoVenta != null ? item.estimadoVenta : item.costo * 2));
  const [notas, setNotas] = useState(item.notas || "");
  const [foto, setFoto] = useState(item.foto || null);
  const [fotoLoading, setFotoLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFotoChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setFotoLoading(true);
    try { setFoto(await processFotoFile(file, cloudCfg)); }
    catch (err) { console.error(err); setError("No se pudo subir la foto."); }
    finally { setFotoLoading(false); }
  };

  const handleSave = () => {
    const val = parseFloat(costo);
    const estVal = parseFloat(estimadoVenta);
    if (!concepto.trim() || !val || val <= 0) { setError("Completá nombre y costo."); return; }
    onSave({ ...item, concepto: concepto.trim(), categoria, talle: talle.trim(), costo: val, estimadoVenta: (estVal && estVal > 0) ? estVal : null, notas: notas.trim(), foto });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Editar prenda</h2>
        {error && <div className="error">{error}</div>}
        <div className="field"><label>Nombre</label><input type="text" value={concepto} onChange={e=>setConcepto(e.target.value)} /></div>
        <div className="row2">
          <div className="field">
            <label>Categoría</label>
            <select value={categoria} onChange={e=>setCategoria(e.target.value)}>
              <option value="">Sin categoría</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field"><label>Talle</label><input type="text" value={talle} onChange={e=>setTalle(e.target.value)} /></div>
        </div>
        <div className="row2">
          <div className="field"><label>Costo</label><input type="number" inputMode="numeric" value={costo} onChange={e=>setCosto(e.target.value)} /></div>
          <div className="field"><label>Estimado de venta</label><input type="number" inputMode="numeric" value={estimadoVenta} onChange={e=>setEstimadoVenta(e.target.value)} /></div>
        </div>
        <div className="field"><label>Notas</label><input type="text" value={notas} onChange={e=>setNotas(e.target.value)} /></div>
        <div className="photo-field">
          <label>Foto</label>
          <div className="photo-picker">
            <label className="pick-btn" htmlFor="edit-foto-input">{fotoLoading ? "procesando…" : foto ? "cambiar foto" : "📷 elegir foto"}</label>
            <input id="edit-foto-input" type="file" accept="image/*" onChange={handleFotoChange} />
            {foto && (
              <div className="photo-preview">
                <img src={foto} alt="preview" />
                <button className="clear" onClick={() => setFoto(null)} title="Quitar foto">×</button>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="cancel" onClick={onClose}>Cancelar</button>
          <button className="save" onClick={handleSave}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

function EditGastoModal({ gasto, onClose, onSave }){
  const [concepto, setConcepto] = useState(gasto.concepto);
  const [costo, setCosto] = useState(String(gasto.costo));
  const [notas, setNotas] = useState(gasto.notas || "");
  const [error, setError] = useState("");

  const handleSave = () => {
    const val = parseFloat(costo);
    if (!concepto.trim() || !val || val <= 0) { setError("Completá nombre y costo."); return; }
    onSave({ ...gasto, concepto: concepto.trim(), costo: val, notas: notas.trim() });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Editar gasto</h2>
        {error && <div className="error">{error}</div>}
        <div className="field"><label>Concepto</label><input type="text" value={concepto} onChange={e=>setConcepto(e.target.value)} /></div>
        <div className="row2">
          <div className="field"><label>Costo</label><input type="number" inputMode="numeric" value={costo} onChange={e=>setCosto(e.target.value)} /></div>
          <div className="field"><label>Notas</label><input type="text" value={notas} onChange={e=>setNotas(e.target.value)} /></div>
        </div>
        <div className="modal-actions">
          <button className="cancel" onClick={onClose}>Cancelar</button>
          <button className="save" onClick={handleSave}>Guardar cambios</button>
        </div>
      </div>
    </div>
  );
}

function SyncModal({ current, onClose, onSave, onDisconnect }){
  const [binId, setBinId] = useState(current ? current.binId : "");
  const [accessKey, setAccessKey] = useState(current ? current.accessKey : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const handleSave = async () => {
    if (!binId.trim() || !accessKey.trim()) { setError("Completá los dos campos."); return; }
    setSaving(true); setError("");
    try { await onSave({ binId: binId.trim(), accessKey: accessKey.trim() }); }
    catch (e) { setError("No se pudo conectar. Revisá el Bin ID y la Access Key."); }
    finally { setSaving(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Sincronización compartida</h2>
        <p>Conectá la caja a un mismo espacio en <a href="https://jsonbin.io" target="_blank" rel="noreferrer">jsonbin.io</a> (gratis) para que vos y tu pareja vean los mismos movimientos.</p>
        <div className="field"><label>Bin ID</label><input type="text" value={binId} onChange={e => setBinId(e.target.value)} placeholder="ej: 656f1a2..." /></div>
        <div className="field"><label>Access Key</label><input type="text" value={accessKey} onChange={e => setAccessKey(e.target.value)} placeholder="$2a$10$..." /></div>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="cancel" onClick={onClose}>Cancelar</button>
          <button className="save" onClick={handleSave} disabled={saving}>{saving ? "Conectando…" : "Guardar"}</button>
        </div>
        {current && <div className="modal-actions"><button className="disconnect" onClick={onDisconnect}>Desconectar sincronización</button></div>}
      </div>
    </div>
  );
}

function PhotoModal({ current, onClose, onSave, onDisconnect }){
  const [cloudName, setCloudName] = useState(current ? current.cloudName : "");
  const [uploadPreset, setUploadPreset] = useState(current ? current.uploadPreset : "");
  const [error, setError] = useState("");
  const handleSave = () => {
    if (!cloudName.trim() || !uploadPreset.trim()) { setError("Completá los dos campos."); return; }
    onSave({ cloudName: cloudName.trim(), uploadPreset: uploadPreset.trim() });
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Almacenamiento de fotos</h2>
        <p>Conectá <a href="https://cloudinary.com" target="_blank" rel="noreferrer">Cloudinary</a> (gratis, sin tarjeta) para que las fotos se guarden ahí en vez de adentro del registro.</p>
        <div className="field"><label>Cloud name</label><input type="text" value={cloudName} onChange={e => setCloudName(e.target.value)} placeholder="ej: dabcxyz12" /></div>
        <div className="field"><label>Upload preset (unsigned)</label><input type="text" value={uploadPreset} onChange={e => setUploadPreset(e.target.value)} placeholder="ej: the2ndcloset_fotos" /></div>
        {error && <div className="error">{error}</div>}
        <div className="modal-actions">
          <button className="cancel" onClick={onClose}>Cancelar</button>
          <button className="save" onClick={handleSave}>Guardar</button>
        </div>
        {current && <div className="modal-actions"><button className="disconnect" onClick={onDisconnect}>Desconectar (volver a guardar local)</button></div>}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
