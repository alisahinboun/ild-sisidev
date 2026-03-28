// ============================================================
// DATA
// ============================================================

const ILLER = [
  "Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Aksaray", "Amasya", "Ankara", "Antalya", 
  "Ardahan", "Artvin", "Aydın", "Balıkesir", "Bartın", "Batman", "Bayburt", "Bilecik", 
  "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", 
  "Diyarbakır", "Düzce", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", 
  "Giresun", "Gümüşhane", "Hakkari", "Hatay", "Iğdır", "Isparta", "İstanbul", "İzmir", 
  "Kahramanmaraş", "Karabük", "Karaman", "Kars", "Kastamonu", "Kayseri", "Kırıkkale", 
  "Kırklareli", "Kırşehir", "Kilis", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", 
  "Mardin", "Mersin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Osmaniye", "Rize", 
  "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Şanlıurfa", "Şırnak", "Tekirdağ", "Tokat", 
  "Trabzon", "Tunceli", "Uşak", "Van", "Yalova", "Yozgat", "Zonguldak"
];

const IL_DISI_ILLER = [
  "Ağrı","Ardahan","Bitlis","Hakkari","Iğdır","İstanbul","Kars","Muş",
  "Siirt","Şanlıurfa","Şırnak","Van"
];

const ALANLAR = [
  "Bilişim Teknolojileri",
  "Biyoloji",
  "Beden Eğitimi",
  "Coğrafya",
  "Çocuk Gelişimi ve Eğitimi",
  "Din Kültürü ve Ahlak Bilgisi",
  "El Sanatları",
  "Felsefe",
  "Fen Bilimleri",
  "Fizik",
  "Görsel Sanatlar",
  "Güzel Sanatlar",
  "Hemşirelik",
  "İngilizce",
  "Almanca",
  "Fransızca",
  "Arapça",
  "Rusça",
  "İspanyolca",
  "İş ve Uğraşı Terapisi",
  "Kimya",
  "Matematik",
  "Meslek Dersleri (Teknik)",
  "Meslek Dersleri (Sağlık)",
  "Meslek Dersleri (Ticaret)",
  "Meslek Dersleri (Tarım)",
  "Müzik",
  "Okul Öncesi",
  "Psikolojik Danışmanlık ve Rehberlik",
  "Sınıf Öğretmenliği",
  "Sosyal Bilgiler",
  "Tarih",
  "Teknoloji ve Tasarım",
  "Türkçe",
  "Türk Dili ve Edebiyatı",
  "Özel Eğitim",
  "Zihinsel Engelliler",
  "İşitme Engelliler",
  "Görme Engelliler",
];

const SAMPLE_NAMES = [
  "Ahmet Yılmaz","Fatma Demir","Mehmet Kaya","Ayşe Çelik","Ali Şahin",
  "Zeynep Arslan","Mustafa Koç","Hatice Aydın","Hasan Doğan","Elif Erdoğan",
  "İbrahim Kılıç","Merve Yıldız","Ömer Çetin","Selin Özdemir","Burak Aslan"
];

let teachers = [];
let myClientId = localStorage.getItem('sim_client_id');
if (!myClientId) {
  myClientId = Math.random().toString(36).substring(2) + Date.now().toString(36);
  localStorage.setItem('sim_client_id', myClientId);
}
let lastAddedId = localStorage.getItem('sim_last_added_id');
if (lastAddedId) lastAddedId = Number(lastAddedId);

let isFormDisabled = false;
let activeTab = 'genel';
const API_URL = '/api/teachers';
let fetchInterval = null;

let currentSessionToken = localStorage.getItem('sim_session_token');

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const adminSecret = localStorage.getItem('sim_admin_secret');
  if (adminSecret) headers['x-admin-secret'] = adminSecret;
  if (currentSessionToken) headers['x-session-token'] = currentSessionToken;
  return headers;
}

// ============================================================
// AUTHENTICATION LOGIC
// ============================================================

function showLoginAlert(msg, type='error') {
  const el = document.getElementById('alertLogin');
  if(el) { el.textContent = msg; el.className = `alert ${type} show`; }
}

function processUnauthorized() {
  localStorage.removeItem('sim_session_token');
  currentSessionToken = null;
  const mainApp = document.getElementById('mainApp');
  const loginScreen = document.getElementById('loginScreen');
  if (mainApp) mainApp.style.display = 'none';
  if (loginScreen) loginScreen.style.display = 'block';
  if (fetchInterval) {
    clearInterval(fetchInterval);
    fetchInterval = null;
  }
}

function toggleRequestBox() {
  const box = document.getElementById('phoneRequestBox');
  const btn = document.getElementById('btnShowRequest');
  if (box && box.style.display === 'none') {
    box.style.display = 'block';
    if(btn) btn.innerHTML = '<i class="fi fi-rr-cross-small"></i> İsteği Kapat';
    document.getElementById('alertLogin').className = 'alert';
  } else {
    hideRequestBox();
  }
}

function hideRequestBox() {
  const box = document.getElementById('phoneRequestBox');
  const btn = document.getElementById('btnShowRequest');
  if(box) box.style.display = 'none';
  if(btn) btn.innerHTML = '<i class="fi fi-brands-whatsapp" style="color:#25D366"></i> Kodu WhatsApp\'tan İste';
}

async function requestOtp() {
  const phone = document.getElementById('loginPhone').value.trim();
  if (!phone) return showLoginAlert('Lütfen telefon numaranızı giriniz.');
  
  const btn = document.getElementById('btnRequestOtp');
  if(btn){ btn.innerHTML = '<i class="fi fi-rr-spinner"></i> Gönderiliyor...'; btn.disabled = true; }

  try {
    const res = await fetch('/api/auth/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if (res.ok) {
      showLoginAlert(data.message || 'Kod WhatsApp üzerinden iletildi!', 'success');
      // Hide request box after 3 seconds as requested
      setTimeout(() => {
        hideRequestBox();
        const al = document.getElementById('alertLogin');
        if(al) al.className = 'alert'; 
      }, 3000);
    } else {
      showLoginAlert(data.error || 'Gönderim başarısız.');
    }
  } catch(e) {
    showLoginAlert('Sunucuya bağlanılamadı.');
  } finally {
    if(btn){ btn.innerHTML = 'WhatsApp\'a Gönder'; btn.disabled = false; }
  }
}

async function verifyOtp() {
  const code = document.getElementById('loginCode').value.trim().toUpperCase();
  if (!code) return showLoginAlert('Lütfen güvenlik kodunuzu giriniz.');

  const btn = document.getElementById('btnVerifyOtp');
  if(btn){ btn.innerText = 'Bekleyin...'; btn.disabled = true; }

  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, client_device_id: myClientId })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('sim_session_token', data.token);
      currentSessionToken = data.token;
      const ls = document.getElementById('loginScreen');
      const ma = document.getElementById('mainApp');
      if(ls) ls.style.display = 'none';
      if(ma) ma.style.display = 'block';
      initAppFlow();
    } else {
      showLoginAlert(data.error || 'Doğrulama başarısız.');
    }
  } catch(e) {
    showLoginAlert('Sunucuya bağlanılamadı.');
  } finally {
    if(btn){ btn.innerText = 'Güvenlik Kodunu Gir'; btn.disabled = false; }
  }
}

function logoutApp() {
  if(!confirm("Oturumu kapatmak istediğinize emin misiniz?")) return;
  localStorage.removeItem('sim_session_token');
  localStorage.removeItem('sim_admin_secret');
  currentSessionToken = null;
  isAdmin = false;
  location.reload();
}

// ============================================================
// ADMIN PHONES MANAGMENT
// ============================================================

async function openAdminPhones() {
  document.getElementById('adminPhonesModal').style.display = 'flex';
  await loadAdminPhones();
}

async function loadAdminPhones() {
  try {
    const res = await fetch('/api/admin/phones', { headers: getHeaders() });
    if (!res.ok) return;
    const list = await res.json();
    const tbody = document.querySelector('#adminPhonesTable tbody');
    if(!tbody) return;
    tbody.innerHTML = list.map(item => `
      <tr>
        <td style="padding:8px;">${item.phone}</td>
        <td style="padding:8px;">${item.name || '-'}</td>
        <td style="padding:8px; text-align:right;"><button class="btn btn-danger-sm" onclick="adminDelPhone('${item.phone}')">&times;</button></td>
      </tr>
    `).join('');
  } catch(e) {}
}

async function adminAddPhone() {
  const phone = document.getElementById('addAdminPhone').value.trim();
  const name = document.getElementById('addAdminName').value.trim();
  if (!phone) return alert("Telefon gerekli!");
  try {
    const res = await fetch('/api/admin/phones', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({phone, name})
    });
    if (res.ok) {
      document.getElementById('addAdminPhone').value = '';
      document.getElementById('addAdminName').value = '';
      loadAdminPhones();
    }
  } catch(e) {}
}

async function adminDelPhone(phone) {
  if (!confirm(phone + ' numarasını silmek istiyor musunuz?')) return;
  try {
    await fetch('/api/admin/phones/' + phone, {
      method: 'DELETE',
      headers: getHeaders()
    });
    loadAdminPhones();
  } catch(e) {}
}

// ============================================================
// APP SETTINGS
// ============================================================

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings', { headers: getHeaders() });
    if (res.status === 401) { processUnauthorized(); return; }
    const data = await res.json();
    if (isFormDisabled !== data.isFormDisabled) {
      isFormDisabled = data.isFormDisabled;
      updateFormUI();
    }
  } catch(e) {}
}

function updateFormUI() {
  const inputs = document.querySelectorAll('.card-body input, .card-body select, .card-body button.btn-primary');
  let alertEl = document.getElementById('formDisabledAlert');
  
  if (isFormDisabled) {
    inputs.forEach(el => el.disabled = true);
    if (!alertEl) {
       alertEl = document.createElement('div');
       alertEl.id = 'formDisabledAlert';
       alertEl.className = 'alert error show';
       alertEl.innerHTML = '<i class="fi fi-rr-lock"></i> Yeni kayıt alımı geçici olarak durdurulmuştur.';
       alertEl.style.marginBottom = '12px';
       document.querySelector('.card-body').prepend(alertEl);
    }
    const btn = document.getElementById('btnToggleForm');
    if (btn) {
       btn.innerHTML = '<i class="fi fi-rr-unlock"></i> Kayıtları Aç';
       btn.style.background = 'var(--success)';
    }
  } else {
    inputs.forEach(el => el.disabled = false);
    if (alertEl) alertEl.remove();
    const btn = document.getElementById('btnToggleForm');
    if (btn) {
       btn.innerHTML = '<i class="fi fi-rr-lock"></i> Kayıtları Durdur';
       btn.style.background = 'var(--warning)';
    }
  }
}

async function toggleFormStatus() {
  const adminSecret = localStorage.getItem('sim_admin_secret');
  if(!adminSecret) return;
  const newStatus = !isFormDisabled;
  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ isFormDisabled: newStatus })
    });
    if (res.status === 401) { processUnauthorized(); return; }
    if (res.ok) {
      isFormDisabled = newStatus;
      updateFormUI();
    }
  } catch(e) {}
}

async function fetchTeachers() {
  try {
    const res = await fetch(API_URL, { headers: getHeaders() });
    if (res.status === 401) { processUnauthorized(); return; }
    if (!res.ok) throw new Error('Network response was not ok');
    teachers = await res.json();
    renderTable();
    renderCityView();
    if (lastAddedId) {
       const myTeacher = teachers.find(t => t.id === lastAddedId);
       if (myTeacher) renderMyRank(myTeacher);
    }
    renderLiveFeed(teachers);
    await fetchSettings();
  } catch (err) {
    console.error('Failed to fetch teachers:', err);
  }
}

// ============================================================
// BOOT
// ============================================================

function initAppFlow() {
  fetchTeachers();
  if (!fetchInterval) {
    fetchInterval = setInterval(fetchTeachers, 15000);
  }
}

function init() {
  const isAdmin = localStorage.getItem('sim_admin_secret');
  if (isAdmin) {
    const badge = document.getElementById('adminBadge');
    if (badge) badge.style.display = 'block';
    
    const btnToggle = document.getElementById('btnToggleForm');
    if (btnToggle) btnToggle.style.display = 'inline-flex';

    const btnManage = document.getElementById('btnManageUsers');
    if (btnManage) btnManage.style.display = 'inline-flex';
  }

  // Populate selects
  const alanSelects = ['inputMevcutAlan','inputHedefAlan','filterHedef','filterSehirAlan'];
  alanSelects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    ALANLAR.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a; opt.textContent = a;
      el.appendChild(opt);
    });
  });

  const ilSelects = ['inputGorevIl','tercih1','tercih2','tercih3','filterIl','filterSehir'];
  ilSelects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    
    if (id.startsWith('tercih')) {
      IL_DISI_ILLER.forEach(il => {
        const opt = document.createElement('option');
        opt.value = il; opt.textContent = il;
        el.appendChild(opt);
      });
      const sep = document.createElement('option');
      sep.disabled = true; sep.textContent = '──────────';
      el.appendChild(sep);
      ILLER.forEach(il => {
        if (!IL_DISI_ILLER.includes(il)) {
          const opt = document.createElement('option');
          opt.value = il; opt.textContent = il;
          el.appendChild(opt);
        }
      });
    } else {
      ILLER.forEach(il => {
        const opt = document.createElement('option');
        opt.value = il; opt.textContent = il;
        el.appendChild(opt);
      });
    }
  });

  if (currentSessionToken || isAdmin) {
    const mainApp = document.getElementById('mainApp');
    const loginScreen = document.getElementById('loginScreen');
    if(mainApp) mainApp.style.display = 'block';
    if(loginScreen) loginScreen.style.display = 'none';
    initAppFlow();
  } else {
    const mainApp = document.getElementById('mainApp');
    const loginScreen = document.getElementById('loginScreen');
    if(mainApp) mainApp.style.display = 'none';
    if(loginScreen) loginScreen.style.display = 'block';
  }
}

// ============================================================
// ADD TEACHER
// ============================================================

function addTeacher() {
  const ad = document.getElementById('inputAd').value.trim();
  const telefon = document.getElementById('inputTelefon').value.trim();
  const mevcutAlan = document.getElementById('inputMevcutAlan').value;
  const hedefAlan = document.getElementById('inputHedefAlan').value;
  const puan = parseFloat(document.getElementById('inputPuan').value);
  const sureYil = parseInt(document.getElementById('inputSureYil').value) || 0;
  const sureAy = parseInt(document.getElementById('inputSureAy').value) || 0;
  const gorevIl = document.getElementById('inputGorevIl').value;
  const t1 = document.getElementById('tercih1').value;
  const t2 = document.getElementById('tercih2').value;
  const t3 = document.getElementById('tercih3').value;

  // Validation
  if (!ad) return showAlert('Ad Soyad giriniz.', 'error');
  if (!telefon) return showAlert('Telefon No giriniz.', 'error');
  if (!mevcutAlan) return showAlert('Mevcut alan seçiniz.', 'error');
  if (!hedefAlan) return showAlert('Hedef alan seçiniz.', 'error');
  if (mevcutAlan === hedefAlan) return showAlert('Mevcut alan ve hedef alan aynı olamaz.', 'error');
  if (isNaN(puan) || puan <= 0) return showAlert('Geçerli bir hizmet puanı giriniz.', 'error');
  if (sureYil === 0 && sureAy === 0) return showAlert('Hizmet süresini giriniz.', 'error');
  if (!gorevIl) return showAlert('Görev yapılan il seçiniz.', 'error');
  if (!t1) return showAlert('En az 1 tercih giriniz.', 'error');

  const tercipler = [t1, t2, t3].filter(t => t);

  const teacher = {
    id: Date.now(),
    ad,
    telefon,
    mevcutAlan,
    hedefAlan,
    puan,
    sureYil,
    sureAy,
    sureToplam: sureYil * 12 + sureAy, // aylar bazında
    gorevIl,
    tercipler,
    addedAt: new Date().toISOString(),
    clientId: myClientId
  };

  fetch(API_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(teacher)
  }).then(async res => {
    if (res.status === 401) { processUnauthorized(); return; }
    const data = await res.json();
    if (!res.ok) {
      showAlert(data.error || 'Kayıt eklenirken hata oluştu.', 'error');
    } else {
      teachers.push(teacher);
      lastAddedId = teacher.id;
      localStorage.setItem('sim_last_added_id', lastAddedId);
      
      showAlert(`"${ad}" simülasyona eklendi! ✓`, 'success');

      // Clear form
      document.getElementById('inputAd').value = '';
      document.getElementById('inputTelefon').value = '';
      document.getElementById('inputPuan').value = '';
      document.getElementById('inputSureYil').value = '';
      document.getElementById('inputSureAy').value = '';
      document.getElementById('tercih1').value = '';
      document.getElementById('tercih2').value = '';
      document.getElementById('tercih3').value = '';

      renderTable();
      renderCityView();
      renderMyRank(teacher);

      // Scroll to their rank
      setTimeout(() => {
        const el = document.getElementById(`row-${teacher.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }).catch(err => {
    console.error(err);
    showAlert('Sunucuya bağlanılamadı.', 'error');
  });
}

// ============================================================
// REMOVE
// ============================================================

function removeTeacher(id) {
  fetch(API_URL + '/' + id, { 
    method: 'DELETE',
    headers: getHeaders()
  }).then(async res => {
    if (res.status === 401) { processUnauthorized(); return; }
    if (!res.ok) {
      const data = await res.json();
      showAlert(data.error || 'Silinirken hata oluştu', 'error');
      return;
    }
    teachers = teachers.filter(t => t.id !== id);
    if (lastAddedId === id) {
      lastAddedId = null;
      localStorage.removeItem('sim_last_added_id');
      document.getElementById('myRankBanner').classList.remove('show');
    }
    renderTable();
    renderCityView();
    showAlert('Kaydınız başarıyla silindi.', 'success');
  }).catch(err => {
    console.error(err);
    showAlert('Sunucu bağlantı hatası.', 'error');
  });
}

// clearAll() kaldırıldı, çünkü paylaşımlı veritabanında tehlikeli.

// ============================================================
// RENDER TABLE
// ============================================================

function sortTeachers(list) {
  return [...list].sort((a, b) => {
    if (b.puan !== a.puan) return b.puan - a.puan;
    if (b.sureToplam !== a.sureToplam) return b.sureToplam - a.sureToplam;
    return a.id - b.id; // kura simülasyonu: ekleme sırası
  });
}
function renderTable() {
  const filterIl = document.getElementById('filterIl').value;
  const filterHedef = document.getElementById('filterHedef').value;

  let filtered = teachers.filter(t => {
    if (filterIl && (!t.tercipler || !t.tercipler.includes(filterIl))) return false;
    if (filterHedef && t.hedefAlan !== filterHedef) return false;
    return true;
  });

  const sorted = sortTeachers(filtered);

  const tbody = document.getElementById('tableBody');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('mainTable');

  if (sorted.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    table.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    table.style.display = 'table';
    tbody.innerHTML = sorted.map((t, i) => renderRow(t, i + 1)).join('');
  }

  // Stats
  document.getElementById('statTotal').textContent = filtered.length;
  if (filtered.length > 0) {
    const max = Math.max(...filtered.map(t => t.puan));
    const avg = (filtered.reduce((s, t) => s + t.puan, 0) / filtered.length).toFixed(2);
    document.getElementById('statMax').textContent = max.toFixed(2);
    document.getElementById('statAvg').textContent = avg;
  } else {
    document.getElementById('statMax').textContent = '—';
    document.getElementById('statAvg').textContent = '—';
  }
}

function formatTelefon(tel) {
  if (!tel) return '-';
  const tStr = String(tel).replace(/\s+/g, '');
  if (tStr.length < 8) return '***';
  return tStr.substring(0, 4) + '***' + tStr.substring(tStr.length - 4);
}

function toggleAdmin() {
  const current = localStorage.getItem('sim_admin_secret');
  if (current) {
    if (confirm('Admin yetkisi kapatılsın mı?')) {
      localStorage.removeItem('sim_admin_secret');
      window.location.reload();
    }
  } else {
    const p = prompt('Admin Şifresi:');
    if (p) {
      localStorage.setItem('sim_admin_secret', p);
      window.location.reload();
    }
  }
}

function renderRow(t, rank) {
  const isMe = t.id === lastAddedId;
  const isAdmin = !!localStorage.getItem('sim_admin_secret');
  const canDelete = isMe || isAdmin;
  const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';

  const tercihHTML = t.tercipler.map((c, i) => {
    const isSpecial = IL_DISI_ILLER.includes(c);
    return `<span class="city-tag city-tag-${i+1}${isSpecial ? ' city-tag-special' : ''}">${i+1}. ${c}</span>`;
  }).join('');

  return `<tr id="row-${t.id}" class="${isMe ? 'highlight' : ''}">
    <td><span class="rank-badge ${rankClass}">${rank}</span></td>
    <td style="font-weight:${isMe?'600':'400'}">${t.ad}${isMe ? ' 👈' : ''}</td>
    <td style="font-family:monospace;color:var(--muted)">${formatTelefon(t.telefon)}</td>
    <td><span style="font-size:0.75rem">${t.mevcutAlan}</span> → <span style="font-size:0.75rem;color:var(--primary)">${t.hedefAlan}</span></td>
    <td style="font-weight:600;color:var(--primary)">${t.puan.toFixed(2)}</td>
    <td style="color:var(--muted)">${t.sureYil}y ${t.sureAy}a</td>
    <td>${t.gorevIl}</td>
    <td>${tercihHTML}</td>
    <td>${canDelete ? `<button class="btn btn-danger-sm" onclick="removeTeacher(${t.id})">Sil</button>` : ''}</td>
  </tr>`;
}

// ============================================================
// CITY VIEW
// ============================================================

function renderCityView() {
  const city = document.getElementById('filterSehir').value;
  const alan = document.getElementById('filterSehirAlan').value;
  const container = document.getElementById('cityViewContent');

  if (!city) {
    container.innerHTML = `<div class="empty-state"><div class="icon">🏙️</div><p>Bir şehir seçin.</p></div>`;
    return;
  }

  // Teachers who preferred this city
  let candidates = teachers.filter(t => t.tercipler.includes(city));
  if (alan) candidates = candidates.filter(t => t.hedefAlan === alan);

  const sorted = sortTeachers(candidates);

  if (sorted.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="icon"><i class="fi fi-rr-search"></i></div><p><strong>${city}</strong> için henüz tercih yapılmadı.</p></div>`;
    return;
  }

  // Group by hedefAlan
  const byAlan = {};
  sorted.forEach(t => {
    if (!byAlan[t.hedefAlan]) byAlan[t.hedefAlan] = [];
    byAlan[t.hedefAlan].push(t);
  });

  let html = `<div style="padding:16px">`;
  html += `<div class="stats-row" style="padding:0 0 12px;border:none">
    <span class="stat-item">${city} için toplam: <strong>${candidates.length}</strong> aday</span>
  </div>`;

  Object.entries(byAlan).forEach(([hedefAlan, list]) => {
    html += `<div style="margin-bottom:20px">
      <div style="font-weight:600;font-size:0.85rem;color:var(--primary);margin-bottom:8px;padding:6px 10px;background:#eff6ff;border-radius:6px">
        ${hedefAlan} → ${city} (${list.length} aday)
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
        <thead><tr>
          <th style="padding:8px;background:#f9fafb;border-bottom:2px solid var(--border);text-align:left">#</th>
          <th style="padding:8px;background:#f9fafb;border-bottom:2px solid var(--border);text-align:left">Ad Soyad</th>
          <th style="padding:8px;background:#f9fafb;border-bottom:2px solid var(--border);text-align:left">Telefon</th>
          <th style="padding:8px;background:#f9fafb;border-bottom:2px solid var(--border);text-align:left">Hizmet Puanı</th>
          <th style="padding:8px;background:#f9fafb;border-bottom:2px solid var(--border);text-align:left">Süre</th>
          <th style="padding:8px;background:#f9fafb;border-bottom:2px solid var(--border);text-align:left">Tercih Sırası</th>
          <th style="padding:8px;background:#f9fafb;border-bottom:2px solid var(--border);text-align:left">Görev İli</th>
        </tr></thead>
        <tbody>`;

    list.forEach((t, i) => {
      const rank = i + 1;
      const rankClass = rank === 1 ? 'rank-1' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
      const isMe = t.id === lastAddedId;
      const isAdmin = !!localStorage.getItem('sim_admin_secret');
      const canDelete = isMe || isAdmin;
      const tercihSira = t.tercipler.indexOf(city) + 1;
      html += `<tr style="${isMe ? 'background:var(--highlight)' : ''}">
        <td style="padding:8px"><span class="rank-badge ${rankClass}">${rank}</span></td>
        <td style="padding:8px;font-weight:${isMe?'600':'400'}">${t.ad}${isMe ? ' 👈' : ''}</td>
        <td style="padding:8px;font-family:monospace;color:var(--muted)">${formatTelefon(t.telefon)}</td>
        <td style="padding:8px;font-weight:600;color:var(--primary)">${t.puan.toFixed(2)}</td>
        <td style="padding:8px;color:var(--muted)">${t.sureYil}y ${t.sureAy}a</td>
        <td style="padding:8px"><span class="city-tag city-tag-${tercihSira}">${tercihSira}. tercih</span></td>
        <td style="padding:8px">${t.gorevIl}</td>
        <td style="padding:8px">${canDelete ? `<button class="btn btn-danger-sm" onclick="removeTeacher(${t.id})">Sil</button>` : ''}</td>
      </tr>`;
    });

    html += `</tbody></table></div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// ============================================================
// MY RANK
// ============================================================

function renderMyRank(teacher) {
  const banner = document.getElementById('myRankBanner');
  const cards = document.getElementById('rankCards');

  if (!teacher.tercipler.length) {
    banner.classList.remove('show');
    return;
  }

  let cardsHTML = '';
  teacher.tercipler.forEach((city, i) => {
    // candidates for this city & hedef alan
    const candidates = sortTeachers(
      teachers.filter(t => t.tercipler.includes(city) && t.hedefAlan === teacher.hedefAlan)
    );
    const rank = candidates.findIndex(t => t.id === teacher.id) + 1;
    const total = candidates.length;

    cardsHTML += `<div class="rank-card">
      <div class="city">${i+1}. tercih</div>
      <div class="city" style="font-weight:600;font-size:0.85rem">${city}</div>
      <div class="num">${rank}</div>
      <div class="total">/ ${total} aday</div>
    </div>`;
  });

  cards.innerHTML = cardsHTML;
  banner.classList.add('show');
  banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================
// TABS
// ============================================================

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach((el, i) => {
    el.classList.toggle('active', (i === 0 && tab === 'genel') || (i === 1 && tab === 'sehir'));
  });
  document.getElementById('tab-genel').classList.toggle('active', tab === 'genel');
  document.getElementById('tab-sehir').classList.toggle('active', tab === 'sehir');
}

// ============================================================
// ALERTS
// ============================================================

function showAlert(msg, type) {
  const el = document.getElementById('alertBox');
  el.textContent = msg;
  el.className = `alert ${type} show`;
  setTimeout(() => el.classList.remove('show'), 4000);
}

// ============================================================
// PERSIST
// ============================================================
// saveData() fonksiyonuna artık gerek kalmadı vì fetch ile ekleniyor.

// ============================================================
// LIVE FEED
// ============================================================
function renderLiveFeed(data) {
  const container = document.getElementById('liveFeed');
  const list = document.getElementById('feedList');
  if (!data || data.length === 0) {
    container.style.display = 'none';
    return;
  }
  
  // Get newest 3 records
  const newest = [...data].sort((a,b) => b.id - a.id).slice(0, 3);
  
  let html = '';
  newest.forEach(t => {
    // Hide last name
    const nameParts = t.adSoyad.trim().split(' ');
    const first = nameParts[0];
    const last = nameParts.length > 1 ? nameParts[nameParts.length - 1][0] + '.' : '';
    const shortName = `${first} ${last}`.trim();
    
    // First preference city
    const target = t.tercipler && t.tercipler.length > 0 ? t.tercipler[0] : 'Sıraya';
    
    html += `<div class="feed-item"><i class="fi fi-rr-time-fast" style="margin-right:4px; color:#94a3b8"></i> <b>${shortName}</b> - ${target} eklendi.</div>`;
  });
  
  list.innerHTML = html;
  container.style.display = 'block';
}

// ============================================================
// BOOT
// ============================================================
init();
