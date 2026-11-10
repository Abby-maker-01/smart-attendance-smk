import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs,
  query, where, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const SCHOOL_LOCATION = { latitude: -6.441803, longitude: 107.947190, radius: 200 };
const today = () => new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jakarta",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const timeNow = () => new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date());
const fullDate = () => new Intl.DateTimeFormat("id-ID",{dateStyle:"full",timeZone:"Asia/Jakarta"}).format(new Date());
$("year").textContent = $("footerYear").textContent = new Date().getFullYear();
$("today").textContent = fullDate();
$("filterMonth").value = today().slice(0,7);

let app, auth, db, currentUser, profile, stream = null, photoData = "", selectedEntryRole = "";
let registering = false;
window.allRecords = [];
const configured = !!(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

if (!configured) {
  $("loginMsg").textContent = "Konfigurasi Firebase belum lengkap.";
} else {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    if (registering) return;
    if (!user) { showLoggedOut(); return; }
    try {
      const snap = await getDoc(doc(db,"users",user.uid));
      if (!snap.exists() || snap.data().active !== true || (snap.data().role === "guru" && snap.data().approved !== true)) {
        const pending = snap.exists() && snap.data().role === "guru" && snap.data().approved === false;
        await signOut(auth);
        showLoggedOut();
        $("loginMsg").textContent = pending ? "Akun guru masih menunggu persetujuan admin." : "Akun belum aktif. Hubungi admin sekolah.";
        return;
      }
      if (snap.data().role === "siswa") {
        await signOut(auth); showLoggedOut();
        $("loginMsg").textContent = "Akun murid sudah tidak tersedia pada aplikasi ini.";
        return;
      }
      profile = { ...snap.data(), uid:user.uid };
      $("loginPanel").classList.add("hidden");
      $("appPanel").classList.remove("hidden");
      $("logoutBtn").classList.remove("hidden");
      $("hello").textContent = "Halo, " + (profile.name || user.email || "Pengguna");
      $("rolePill").textContent = ({admin:"Admin",guru:"Guru",siswa:"Murid"})[profile.role] || "Pengguna";
      $("adminPanel").classList.toggle("hidden",profile.role !== "admin");
      $("userPanel").classList.toggle("hidden",profile.role === "admin");
      $("profileName").textContent = profile.name || user.email;
      $("profileInitial").textContent = (profile.name || "SM").split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();
      $("profileDetails").textContent = profile.role === "siswa" ? `Murid · Kelas ${profile.className || "—"} · ${profile.major || "—"}` : "Guru SMK Mandiri Haurgeulis";
      $("checkInBtn").classList.toggle("hidden",profile.role !== "guru");
      $("checkOutBtn").classList.toggle("hidden",profile.role !== "guru");
      $("submitAttendance").classList.toggle("hidden",profile.role === "guru");
      await refreshOwnAttendance();
      if (profile.role === "admin") { await loadPendingTeachers(); await loadRecords(); }
    } catch (e) {
      $("globalMsg").textContent = "Gagal memuat profil. Periksa Firestore Rules dan koneksi internet.";
    }
  });
}

function showLoggedOut() {
  $("loginPanel").classList.remove("hidden");
  $("appPanel").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  stopCamera();
}
function distanceMeters(lat1,lon1,lat2,lon2) {
  const rad = x => x * Math.PI / 180, R = 6371000;
  const dLat = rad(lat2-lat1), dLon = rad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function getSchoolDistance() {
  return new Promise((resolve,reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS tidak didukung perangkat ini."));
    navigator.geolocation.getCurrentPosition(pos => {
      resolve({distance:distanceMeters(pos.coords.latitude,pos.coords.longitude,SCHOOL_LOCATION.latitude,SCHOOL_LOCATION.longitude),accuracy:pos.coords.accuracy});
    },() => reject(new Error("Lokasi gagal diambil. Aktifkan GPS dan izinkan akses lokasi.")),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
}
function recordId(uid,date) { return `${uid}_${date}`; }

document.querySelectorAll("[data-entry-role]").forEach(btn => btn.addEventListener("click",() => {
  selectedEntryRole = btn.dataset.entryRole;
  $("chosenRoleLabel").textContent = ({guru:"Guru",admin:"Admin"})[selectedEntryRole];
  $("registerRole").value = selectedEntryRole;
  $("authForms").classList.remove("hidden");
  $("loginForm").classList.remove("hidden");
  $("registerForm").classList.add("hidden");
  $("loginMsg").textContent = "";
  $("showRegisterBtn").classList.toggle("hidden",selectedEntryRole === "admin");
}));
$("backRoleBtn").addEventListener("click",() => $("authForms").classList.add("hidden"));
$("showRegisterBtn").addEventListener("click",() => {
  if (selectedEntryRole === "admin") return;
  $("loginForm").classList.add("hidden");
  $("registerForm").classList.remove("hidden");
  $("registerRole").value = selectedEntryRole;
  $("teacherNotice").classList.remove("hidden");
  $("registerMsg").textContent = "";
});
$("backLoginBtn").addEventListener("click",() => {
  $("registerForm").classList.add("hidden");
  $("loginForm").classList.remove("hidden");
});
$("loginForm").addEventListener("submit",async e => {
  e.preventDefault();
  if (!auth) return;
  $("loginMsg").textContent = "Memeriksa akun...";
  try {
    await signInWithEmailAndPassword(auth,$("email").value.trim(),$("password").value);
    $("loginMsg").textContent = "";
  } catch {
    $("loginMsg").textContent = "Login gagal. Periksa email dan kata sandi.";
  }
});
$("logoutBtn").addEventListener("click",() => auth && signOut(auth));
$("registerForm").addEventListener("submit",async e => {
  e.preventDefault();
  const name=$("registerName").value.trim(), email=$("registerEmail").value.trim();
  const password=$("registerPassword").value, role=$("registerRole").value, msg=$("registerMsg");
  if (!auth || !db) { msg.textContent="Firebase belum siap."; return; }
  if (role !== "guru") { msg.textContent="Peran tidak valid."; return; }
  const button=$("registerForm").querySelector('button[type="submit"]');
  registering=true; button.disabled=true; msg.textContent="Membuat akun...";
  let credential;
  try {
    credential=await createUserWithEmailAndPassword(auth,email,password);
    const userData = {
      name, email, role, active:false,
      approved:false,
      createdAt: serverTimestamp()
    };
    await setDoc(doc(db,"users",credential.user.uid),userData);
    await signOut(auth);
    $("registerForm").reset();
    $("registerForm").classList.add("hidden");
    $("loginForm").classList.remove("hidden");
    $("loginMsg").textContent = "Pendaftaran guru berhasil. Tunggu persetujuan admin.";
    msg.textContent="";
  } catch (error) {
    if (credential) { try { await signOut(auth); } catch {} }
    msg.textContent = error.code==="auth/email-already-in-use" ? "Email ini sudah terdaftar." :
      error.code==="auth/invalid-email" ? "Format email tidak valid." :
      "Pendaftaran gagal. Pastikan Firestore Rules sudah dipasang.";
  } finally { registering=false; button.disabled=false; }
});

async function compressPhoto(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;});
  const canvas=$("photoCanvas"), max=720, scale=Math.min(1,max/Math.max(img.width,img.height));
  canvas.width=Math.round(img.width*scale); canvas.height=Math.round(img.height*scale);
  canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
  let quality=.65, out=canvas.toDataURL("image/jpeg",quality);
  while (out.length > 450000 && quality > .3) { quality-=.1; out=canvas.toDataURL("image/jpeg",quality); }
  return out;
}
async function startCamera() {
  try {
    stopCamera();
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720},height:{ideal:720}},audio:false});
    $("camera").srcObject=stream;
    $("camera").classList.remove("hidden");
    $("takePhotoBtn").classList.remove("hidden");
    $("startCameraBtn").classList.add("hidden");
    $("photoPreview").classList.add("hidden");
    $("photoMsg").textContent="Kamera aktif. Ambil foto saat siap.";
  } catch {
    $("photoMsg").textContent="Kamera tidak dapat dibuka. Izinkan akses kamera dan buka aplikasi melalui HTTPS.";
  }
}
function stopCamera() {
  if (stream) stream.getTracks().forEach(t=>t.stop());
  stream=null;
  if ($("camera")) $("camera").srcObject=null;
}
$("startCameraBtn").addEventListener("click",startCamera);
$("takePhotoBtn").addEventListener("click",async() => {
  try {
    const video=$("camera"), canvas=$("photoCanvas");
    if (!video.videoWidth) { $("photoMsg").textContent="Tunggu kamera siap, lalu coba lagi."; return; }
    canvas.width=video.videoWidth; canvas.height=video.videoHeight;
    canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
    photoData=await compressPhoto(canvas.toDataURL("image/jpeg",.8));
    $("photoPreview").src=photoData; $("photoPreview").classList.remove("hidden");
    $("camera").classList.add("hidden"); $("takePhotoBtn").classList.add("hidden");
    $("retakePhotoBtn").classList.remove("hidden"); $("photoMsg").textContent="Foto siap digunakan.";
    stopCamera();
  } catch { $("photoMsg").textContent="Foto gagal diproses. Silakan ulangi."; }
});
$("retakePhotoBtn").addEventListener("click",async() => {
  photoData=""; $("retakePhotoBtn").classList.add("hidden"); await startCamera();
});

async function refreshOwnAttendance() {
  if (!currentUser || !profile || profile.role!=="guru") return;
  try {
    const snap=await getDoc(doc(db,"attendance",recordId(currentUser.uid,today())));
    const r=snap.exists()?snap.data():null;
    $("userStatus").textContent = r ? `Status: ${r.status} · Masuk: ${r.checkIn||"—"} · Pulang: ${r.checkOut||"—"}` : "Belum mengisi absensi hari ini.";
    if (r) {
      $("statusSelect").value=r.status;
      $("note").value=r.note||"";
      if (r.photo) { $("photoPreview").src=r.photo; $("photoPreview").classList.remove("hidden"); photoData=r.photo; }
      if (profile.role==="guru" && r.status!=="Hadir") $("checkOutBtn").classList.add("hidden");
      else if (profile.role==="guru") $("checkOutBtn").classList.remove("hidden");
      if (r.checkIn) $("checkInBtn").disabled=true;
      if (r.checkOut) $("checkOutBtn").disabled=true;
    }
  } catch { $("globalMsg").textContent="Tidak dapat membaca absensi. Periksa Rules Firebase."; }
}
async function saveAttendance(action) {
  if (!currentUser || !profile || profile.role!=="guru") return;
  const status=$("statusSelect").value, date=today(), id=recordId(currentUser.uid,date), ref=doc(db,"attendance",id);
  const isStudent=profile.role==="siswa";
  if (isStudent && action!=="status") return;
  if (profile.role==="guru" && action==="status") return;
  if (!photoData) { $("globalMsg").textContent="Ambil foto terlebih dahulu."; return; }
  if (action==="out" && status!=="Hadir") { $("globalMsg").textContent="Absen pulang hanya tersedia untuk guru berstatus Hadir."; return; }
  const buttons=[$("submitAttendance"),$("checkInBtn"),$("checkOutBtn")];
  buttons.forEach(b=>b.disabled=true);
  try {
    if (status==="Hadir") {
      $("globalMsg").textContent="Memeriksa lokasi GPS...";
      const loc=await getSchoolDistance();
      if (loc.accuracy>50) throw new Error("Akurasi GPS kurang baik. Aktifkan lokasi akurasi tinggi dan coba lagi.");
      if (loc.distance>SCHOOL_LOCATION.radius) throw new Error(`Absen Hadir ditolak. Jarakmu sekitar ${Math.round(loc.distance)} meter dari sekolah; batas 100 meter.`);
    }
    const oldSnap=await getDoc(ref), old=oldSnap.exists()?oldSnap.data():{};
    if (action==="in" && old.checkIn) throw new Error("Absen masuk hari ini sudah tercatat.");
    if (action==="out" && !old.checkIn) throw new Error("Absen masuk terlebih dahulu.");
    if (action==="out" && old.checkOut) throw new Error("Absen pulang hari ini sudah tercatat.");
    if (action==="status" && old.checkIn) throw new Error("Absensi hari ini sudah tercatat. Hubungi admin jika perlu koreksi.");
    const patch={
      uid:currentUser.uid,name:profile.name||currentUser.email,email:currentUser.email||"",
      role:profile.role,className:profile.className||"",major:profile.major||"",
      date,status,note:$("note").value.trim(),photo:photoData,updatedAt:serverTimestamp()
    };
    if (action==="status" || action==="in") patch.checkIn=timeNow();
    if (action==="out") patch.checkOut=timeNow();
    await setDoc(ref,{...old,...patch,createdAt:old.createdAt||serverTimestamp()});
    $("globalMsg").textContent="Absensi berhasil disimpan.";
    await refreshOwnAttendance();
    if (profile.role==="guru" && status!=="Hadir") $("checkOutBtn").classList.add("hidden");
  } catch (err) {
    $("globalMsg").textContent=err.message||"Absensi gagal. Periksa koneksi dan Rules Firebase.";
  } finally { buttons.forEach(b=>b.disabled=false); }
}
$("submitAttendance").addEventListener("click",()=>saveAttendance("status"));
$("checkInBtn").addEventListener("click",()=>saveAttendance("in"));
$("checkOutBtn").addEventListener("click",()=>saveAttendance("out"));
$("statusSelect").addEventListener("change",() => {
  if (profile?.role==="guru") $("checkOutBtn").classList.toggle("hidden",$("statusSelect").value!=="Hadir");
});

async function loadPendingTeachers() {
  try {
    const q=query(collection(db,"users"),where("role","==","guru"),where("approved","==",false));
    const snap=await getDocs(q), target=$("pendingTeachers");
    $("pendingCount").textContent=`${snap.size} menunggu`;
    if (!snap.size) { target.className="empty-state"; target.textContent="Tidak ada pendaftaran guru yang menunggu."; return; }
    target.className="";
    target.innerHTML=snap.docs.map(d=>{
      const u=d.data();
      return `<div class="pending-card"><div><strong>${esc(u.name||"Tanpa nama")}</strong><p>${esc(u.email||"")} · Menunggu persetujuan</p></div><div class="pending-actions"><button class="button button-primary" data-approve="${d.id}">Setujui</button><button class="button button-ghost" data-reject="${d.id}">Tolak</button></div></div>`;
    }).join("");
    target.querySelectorAll("[data-approve]").forEach(b=>b.addEventListener("click",()=>approveTeacher(b.dataset.approve)));
    target.querySelectorAll("[data-reject]").forEach(b=>b.addEventListener("click",()=>rejectTeacher(b.dataset.reject)));
  } catch { $("pendingTeachers").textContent="Tidak dapat memuat pendaftaran. Pastikan akun ini admin dan Rules sudah dipasang."; }
}
async function approveTeacher(uid) {
  try { await updateDoc(doc(db,"users",uid),{approved:true,active:true}); $("globalMsg").textContent="Akun guru disetujui."; await loadPendingTeachers(); }
  catch { $("globalMsg").textContent="Gagal menyetujui akun. Periksa Firestore Rules admin."; }
}
async function rejectTeacher(uid) {
  if (!confirm("Tolak pendaftaran guru ini? Akun akan tetap nonaktif.")) return;
  try { await updateDoc(doc(db,"users",uid),{approved:false,active:false,rejected:true}); $("globalMsg").textContent="Pendaftaran ditolak dan akun tetap nonaktif."; await loadPendingTeachers(); }
  catch { $("globalMsg").textContent="Gagal menolak pendaftaran."; }
}
function esc(v) { return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
async function loadRecords() {
  try { const snap=await getDocs(collection(db,"attendance")); window.allRecords=snap.docs.map(d=>d.data()); renderRecords(); }
  catch { $("teacherRecords").innerHTML='<div class="empty-state">Tidak dapat memuat data. Periksa Firestore Rules admin.</div>'; }
}
function statusTag(status) {
  const cl=(status||"").toLowerCase();
  return `<span class="status-tag ${cl}">${esc(status||"—")}</span>`;
}
function recordCard(r) {
  const photo=r.photo?`<img class="record-photo" src="${r.photo}" alt="Foto ${esc(r.name)}">`:`<div class="record-photo"></div>`;
  return `<article class="record-card">${photo}<div class="record-main"><strong>${esc(r.name||"Tanpa nama")}</strong><div class="record-meta">${"Guru"}<br>${esc(r.email||"")}<br>${esc(r.date||"")}</div>${statusTag(r.status)}${r.note?`<div class="record-meta">Catatan: ${esc(r.note)}</div>`:""}</div><div class="record-times"><div>Masuk <strong>${esc(r.checkIn||"—")}</strong></div><div>Pulang <strong>${esc(r.checkOut||"—")}</strong></div></div></article>`;
}
function selectedMonth() { return $("filterMonth").value || today().slice(0,7); }
function filteredRecords() {
  const month=selectedMonth(), status=$("filterStatus").value, search=$("searchName").value.toLowerCase();
  return window.allRecords.filter(r=>r.role==="guru" && String(r.date||"").slice(0,7)===month && (!status||r.status===status) && (`${r.name||""} ${r.email||""}`.toLowerCase().includes(search))).sort((a,b)=>(a.name||"").localeCompare(b.name||""));
}
function renderRecords() {
  const rows=filteredRecords();
  $("countTotal").textContent=rows.length;
  $("countPresent").textContent=rows.filter(r=>r.status==="Hadir").length;
  $("countOther").textContent=rows.filter(r=>r.status==="Sakit"||r.status==="Izin").length;
  $("teacherRecords").innerHTML=rows.length?rows.map(recordCard).join(""):'<div class="empty-state">Belum ada absensi guru pada bulan yang dipilih.</div>';
}
["filterMonth","filterStatus"].forEach(id=>$(id).addEventListener("change",renderRecords));
$("searchName").addEventListener("input",renderRecords);
$("exportBtn").addEventListener("click",()=>{
  const rows=[["Nama","Email","Peran","Status","Tanggal","Jam masuk","Jam pulang","Catatan"]];
  filteredRecords().forEach(r=>rows.push([r.name,r.email,r.role,r.status,r.date,r.checkIn,r.checkOut,r.note]));
  const csv=rows.map(row=>row.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a");a.href=url;a.download=`riwayat-absensi-${selectedMonth()}.csv`;a.click();URL.revokeObjectURL(url);
});
  
