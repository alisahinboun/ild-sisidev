const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
// const { Client, LocalAuth } = require('whatsapp-web.js');
// const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());

// Serve HTML file directly
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'alan-degisikligi-simulasyon.html'));
});

let isFormDisabled = false;

// Simple in-memory rate limiting
const rateLimits = {};
function isRateLimited(key, limit = 5, windowMs = 60000) {
  const now = Date.now();
  if (!rateLimits[key]) {
     rateLimits[key] = { count: 1, resetAt: now + windowMs };
     return false;
  }
  if (now > rateLimits[key].resetAt) {
     rateLimits[key] = { count: 1, resetAt: now + windowMs };
     return false;
  }
  rateLimits[key].count++;
  return rateLimits[key].count > limit;
}

app.get('/api/settings', (req, res) => {
  res.json({ isFormDisabled });
});

app.post('/api/settings', (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== (process.env.ADMIN_SECRET || 'inekle2026')) {
    return res.status(403).json({ error: 'Yetkisiz' });
  }
  if (typeof req.body.isFormDisabled !== 'undefined') {
    isFormDisabled = req.body.isFormDisabled;
  }
  res.json({ success: true, isFormDisabled });
});

const { DATABASE_URL } = process.env;

let dbQuery;

if (DATABASE_URL) {
  console.log("Bağlantı Türü: PostgreSQL (Render)");
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  dbQuery = async (sql, params = []) => {
    // Convert SQLite '?' parameters to PostgreSQL '$1, $2, ...'
    let i = 1;
    const pgSql = sql.replace(/\?/g, () => `$${i++}`);
    const res = await pool.query(pgSql, params);
    // Mimic the exact output shapes
    if (sql.trim().toUpperCase().startsWith("SELECT")) {
      return res.rows;
    } else {
      return { changes: res.rowCount };
    }
  };
  
} else {
  console.log("Bağlantı Türü: SQLite (Local)");
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database('./database.sqlite');
  
  dbQuery = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes, id: this.lastID });
        });
      }
    });
  };
}

// Initialize tables
dbQuery(`CREATE TABLE IF NOT EXISTS teachers (
  id BIGINT PRIMARY KEY,
  ad TEXT,
  "mevcutAlan" TEXT,
  "hedefAlan" TEXT,
  puan REAL,
  "sureYil" INTEGER,
  "sureAy" INTEGER,
  "sureToplam" INTEGER,
  "gorevIl" TEXT,
  tercipler TEXT,
  "addedAt" TEXT,
  "clientId" TEXT,
  telefon TEXT
)`).then(() => {
  if (DATABASE_URL) {
    dbQuery(`ALTER TABLE teachers ADD COLUMN IF NOT EXISTS telefon TEXT;`).catch(() => {});
  } else {
    dbQuery(`ALTER TABLE teachers ADD COLUMN telefon TEXT;`).catch(() => {});
  }
}).catch(err => console.error("Tablo oluşturma hatası:", err));

dbQuery(`CREATE TABLE IF NOT EXISTS users (
  phone TEXT PRIMARY KEY,
  name TEXT,
  security_code TEXT UNIQUE,
  device_fp TEXT,
  "addedAt" TEXT
)`).catch(() => {});

dbQuery(`CREATE TABLE IF NOT EXISTS pool_codes (
  code TEXT PRIMARY KEY
)`).catch(() => {});

dbQuery(`CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  phone TEXT,
  "expiresAt" BIGINT
)`).then(() => {
  if (DATABASE_URL) {
    dbQuery(`ALTER TABLE sessions ALTER COLUMN "expiresAt" TYPE BIGINT;`).catch(() => {});
  }
}).catch(() => {});

const logTableSql = DATABASE_URL 
  ? `CREATE TABLE IF NOT EXISTS admin_logs (id SERIAL PRIMARY KEY, phone TEXT, event TEXT, ip TEXT, ua TEXT, datetime TEXT)`
  : `CREATE TABLE IF NOT EXISTS admin_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT, event TEXT, ip TEXT, ua TEXT, datetime TEXT)`;
dbQuery(logTableSql).catch(err => console.error("Log tablosu hatası:", err));

async function addLog(phone, event, req) {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (ip.includes(',')) ip = ip.split(',')[0].trim();
  const ua = req.headers['user-agent'] || 'unknown';
  try {
    await dbQuery('INSERT INTO admin_logs (phone, event, ip, ua, datetime) VALUES (?, ?, ?, ?, ?)', 
      [phone || 'SYSTEM', event, ip, ua, new Date().toISOString()]);
  } catch(e) { console.error('[LOG ERROR]', e); }
}

// Ensure 300 initial codes
async function ensurePoolCodes() {
  try {
    const countRes = await dbQuery('SELECT COUNT(*) as count FROM pool_codes');
    if (countRes && countRes[0] && countRes[0].count === 0) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // excluding O,0,1,I
      for(let i = 0; i < 300; i++) {
          let unique = false;
          while(!unique) {
             let code = '';
             for(let c=0; c<6; c++) code += chars.charAt(Math.floor(Math.random() * chars.length));
             try {
               await dbQuery('INSERT INTO pool_codes (code) VALUES (?)', [code]);
               unique = true;
             } catch(e) { }
          }
      }
      console.log('[SYSTEM] 300 yeni güvenlik kodu havuza eklendi.');
    }
  } catch(e) { console.error('Havuz kontrol hatası:', e); }
}
ensurePoolCodes();

// WhatsApp Initialization
let isWhatsAppReady = false;

// Cleanup stale Chromium locks from persistent disk on Render
const sessionDir = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(sessionDir)) {
    console.log('[SYSTEM] Temizlik yapılıyor: SingletonLock dosyaları aranıyor...');
    const deleteLocks = (dir) => {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            if (fs.lstatSync(fullPath).isDirectory()) {
                deleteLocks(fullPath);
            } else if (file === 'SingletonLock' || file === 'SingletonSocket') {
                try { fs.unlinkSync(fullPath); console.log(`[SYSTEM] Kilit dosyası silindi: ${fullPath}`); } catch(e) {}
            }
        }
    };
    try { deleteLocks(sessionDir); } catch(e) {}
}

/* 
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: { 
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ] 
    }
});

client.on('qr', (qr) => {
    console.log('\n====================================');
    console.log('[WHATSAPP] Lütfen QR Kodu Okutun:');
    qrcode.generate(qr, {small: true});
    console.log(`[QR LINK]: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
    console.log('====================================\n');
});

client.on('ready', () => {
    console.log('[WHATSAPP] İstemci Hazır ve Bağlandı!');
    isWhatsAppReady = true;
});

client.on('disconnected', () => {
    console.log('[WHATSAPP] İstemci bağlantısı koptu.');
    isWhatsAppReady = false;
});

client.initialize(); 
*/ 

// --- AUTHENTICATION & OTP ENDPOINTS --- //

function formatPhoneForWa(phone) {
  let p = phone.replace(/\D/g, '');
  if (p.startsWith('0')) p = p.substring(1);
  if (!p.startsWith('90')) p = '90' + p;
  return p + '@c.us';
}

app.post('/api/auth/request', async (req, res) => {
  return res.status(403).json({ error: 'WhatsApp ile otomatik kod gönderimi şu an devre dışıdır. Lütfen yönetici ile iletişime geçiniz.' });
});

app.post('/api/auth/verify', async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (isRateLimited('auth_ver_' + ip, 10, 60000)) { // Dakikada max 10 deneme
    return res.status(429).json({ error: 'Çok fazla hatalı deneme yaptınız. Lütfen 1 dakika bekleyin.' });
  }
  const { code, client_device_id } = req.body;
  if (!code || !client_device_id) return res.status(400).json({ error: 'Eksik bilgi: Güvenlik kodu veya tarayıcı kimliği bulunamadı.' });

  try {
    const userQuery = await dbQuery('SELECT * FROM users WHERE security_code = ?', [code]);
    if (!userQuery || userQuery.length === 0) {
      await addLog(code, 'LOGIN_FAILED_INVALID_CODE', req);
      return res.status(400).json({ error: 'Hatalı güvenlik kodu.' });
    }
    
    const user = userQuery[0];
    const cleanPhone = user.phone;

    // DEVICE LOCK CHECK
    if (!user.device_fp) {
      // First time login, lock it
      await dbQuery('UPDATE users SET device_fp = ? WHERE phone = ?', [client_device_id, cleanPhone]);
    } else if (user.device_fp !== client_device_id) {
      // Mismatch
      await addLog(cleanPhone, 'LOGIN_FAILED_DEVICE_MISMATCH', req);
      return res.status(403).json({ error: 'Bu kod başka bir cihaz ile eşleştirilmiş. Yalnızca kodun ilk girildiği cihazdan sisteme giriş yapılabilir.' });
    }

    // Success! Generate token
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const sessionExpiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 1 week

    await dbQuery('INSERT INTO sessions (token, phone, "expiresAt") VALUES (?, ?, ?)', [token, cleanPhone, sessionExpiresAt]);

    await addLog(cleanPhone, 'LOGIN_SUCCESS', req);
    res.json({ success: true, token, phone: cleanPhone });
  } catch(err) {
    console.error("[AUTH VERIFY ERROR]:", err);
    res.status(500).json({ error: 'Doğrulama hatası: ' + (err.message || 'Bilinmeyen hata') });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const sessions = await dbQuery('SELECT phone FROM sessions WHERE token = ? AND "expiresAt" > ?', [token, Date.now()]);
    if (sessions && sessions[0]) {
      res.json({ phone: sessions[0].phone });
    } else {
      res.status(401).json({ error: 'Invalid session' });
    }
  } catch(e) { res.status(500).json({ error: 'Error' }); }
});

// Middleware to check session
async function checkAuth(req, res, next) {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret && adminSecret === (process.env.ADMIN_SECRET || 'inekle2026')) {
    req.isAdmin = true;
    return next();
  }

  const token = req.headers['x-session-token'];
  if (!token) return res.status(401).json({ error: 'Yetkisiz erişim. Lütfen giriş yapın.' });

  try {
    const sessions = await dbQuery('SELECT * FROM sessions WHERE token = ? AND "expiresAt" > ?', [token, Date.now()]);
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: 'Oturum süresi dolmuş veya geçersiz.' });
    }
    req.userPhone = sessions[0].phone;
    next();
  } catch(err) {
    res.status(500).json({ error: 'Yetki kontrolü hatası' });
  }
}

// --- ADMIN API --- //
app.get('/api/admin/users', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== (process.env.ADMIN_SECRET || 'inekle2026')) return res.status(403).json({ error: 'Yetkisiz' });
  try {
    const rows = await dbQuery(`
      SELECT phone, name, security_code, device_fp, "addedAt" 
      FROM users ORDER BY "addedAt" DESC
    `);
    
    const poolRes = await dbQuery('SELECT COUNT(*) as count FROM pool_codes');
    const availableCodes = poolRes && poolRes[0] ? poolRes[0].count : 0;

    res.json({ users: rows, availableCodes });
  } catch(e) { res.status(500).json({error: 'Hata'}); }
});

app.post('/api/admin/users', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== (process.env.ADMIN_SECRET || 'inekle2026')) return res.status(403).json({ error: 'Yetkisiz' });
  const { phone, name } = req.body;
  if (!phone) return res.status(400).json({error:'Telefon gerekli'});
  const cleanPhone = phone.replace(/\s+/g, '');
  
  try {
    const existing = await dbQuery('SELECT phone FROM users WHERE phone = ?', [cleanPhone]);
    if (existing && existing.length > 0) return res.status(400).json({error: 'Bu numara zaten kayıtlı.'});

    const codeRes = await dbQuery('SELECT code FROM pool_codes LIMIT 1');
    if (!codeRes || codeRes.length === 0) return res.status(500).json({error:"Havuzda atanacak kod kalmamış. Lütfen boş kod üretin!"});
    const newCode = codeRes[0].code;

    await dbQuery('INSERT INTO users (phone, name, security_code, "addedAt") VALUES (?, ?, ?, ?)', [cleanPhone, name || '', newCode, new Date().toISOString()]);
    await dbQuery('DELETE FROM pool_codes WHERE code = ?', [newCode]);
    res.json({success: true, assigned_code: newCode});
  } catch(e) { res.status(500).json({error: 'Hata: ' + e.message}); }
});

app.post('/api/admin/users/bulk', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== (process.env.ADMIN_SECRET || 'inekle2026')) return res.status(403).json({ error: 'Yetkisiz' });
  
  const { users } = req.body;
  if (!users || !Array.isArray(users)) return res.status(400).json({ error: 'Geçersiz veri formatı' });

  const results = { added: 0, skipped: 0, errors: [] };

  for (const user of users) {
    const { phone, name } = user;
    if (!phone) continue;
    const cleanPhone = phone.replace(/\s+/g, '');
    
    try {
      const existing = await dbQuery('SELECT phone FROM users WHERE phone = ?', [cleanPhone]);
      if (existing && existing.length > 0) {
        results.skipped++;
        continue;
      }

      const poolRows = await dbQuery('SELECT code FROM pool_codes LIMIT 1');
      if (!poolRows || poolRows.length === 0) {
        results.errors.push(`${phone}: Havuzda boş kod kalmadı!`);
        break; 
      }

      const assignedCode = poolRows[0].code;
      await dbQuery('DELETE FROM pool_codes WHERE code = ?', [assignedCode]);
      await dbQuery(
        'INSERT INTO users (phone, name, security_code, "addedAt") VALUES (?, ?, ?, ?)',
        [cleanPhone, name || 'İsimsiz', assignedCode, new Date().toISOString()]
      );
      results.added++;
    } catch (err) {
      results.errors.push(`${phone}: Hata oluştu`);
    }
  }

  res.json(results);
});

app.delete('/api/admin/users/:phone', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== (process.env.ADMIN_SECRET || 'inekle2026')) return res.status(403).json({ error: 'Yetkisiz' });
  try {
    const phone = req.params.phone;
    // Delete simulation data belonging to this user
    await dbQuery('DELETE FROM teachers WHERE telefon = ?', [phone]);
    // Invalidate user sessions
    await dbQuery('DELETE FROM sessions WHERE phone = ?', [phone]);
    // Remove user and return security code logic (just delete user for now)
    await dbQuery('DELETE FROM users WHERE phone = ?', [phone]);
    
    res.json({success: true});
  } catch(e) { 
    console.error('[ADMIN] Kullanıcı silinirken hata:', e);
    res.status(500).json({error: 'Kullanıcı silinemedi'}); 
  }
});

app.post('/api/admin/codes/generate', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== (process.env.ADMIN_SECRET || 'inekle2026')) return res.status(403).json({ error: 'Yetkisiz' });
  let count = 0;
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for(let i = 0; i < 300; i++) {
      let unique = false;
      while(!unique) {
         let code = '';
         for(let c=0; c<6; c++) code += chars.charAt(Math.floor(Math.random() * chars.length));
         try {
           await dbQuery('INSERT INTO pool_codes (code) VALUES (?)', [code]);
           unique = true; count++;
         } catch(e) { }
      }
  }
  res.json({success: true, message: `${count} adet yeni kod üretildi.`});
});

app.get('/api/admin/logs', async (req, res) => {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== (process.env.ADMIN_SECRET || 'inekle2026')) return res.status(403).json({ error: 'Yetkisiz' });
  try {
    const logs = await dbQuery('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 100');
    res.json(logs);
  } catch(e) { res.status(500).json({error: 'Loglar okunamadı'}); }
});


// Get all teachers
app.get('/api/teachers', checkAuth, async (req, res) => {
  const isAdmin = req.headers['x-admin-secret'] === (process.env.ADMIN_SECRET || 'inekle2026');
  try {
    const rows = await dbQuery('SELECT * FROM teachers');
    const processedRows = rows.map(r => {
      try { 
        r.tercipler = typeof r.tercipler === 'string' ? JSON.parse(r.tercipler) : r.tercipler; 
      } catch(e) { 
        r.tercipler = []; 
      }
      
      // Identify the current user's record
      const rawPhone = String(r.telefon || '').replace(/\s+/g, '');
      const currentPhone = String(req.userPhone || '').replace(/\s+/g, '');
      if (rawPhone && rawPhone === currentPhone) {
        r.isMe = true;
      }

      // Mask phone numbers for non-admins
      if (!isAdmin && r.telefon) {
        const tStr = String(r.telefon).replace(/\s+/g, '');
        if (tStr.length >= 8) {
          r.telefon = tStr.substring(0, 4) + '***' + tStr.substring(tStr.length - 4);
        } else {
          r.telefon = '***';
        }
      }
      return r;
    });
    res.json(processedRows);
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Veritabanı okunurken bir hata oluştu' });
  }
});

// Add a teacher
app.post('/api/teachers', checkAuth, async (req, res) => {
  const {
    id, ad, mevcutAlan, hedefAlan, puan, sureYil, 
    sureAy, sureToplam, gorevIl, tercipler, addedAt, clientId
  } = req.body;
  let { telefon } = req.body;

  // SECURITY: If not admin, force use the phone number from the session
  if (!req.isAdmin) {
    telefon = req.userPhone;
  }

  if (!clientId) {
    return res.status(400).json({ error: 'clientId gerekli' });
  }

  if (isFormDisabled) {
    return res.status(403).json({ error: 'Yeni kayıt alımı geçici olarak durdurulmuştur.' });
  }

  try {
    // SECURITY: Use phone from session to prevent duplicates
    const checkPhone = req.isAdmin ? (telefon || 'ADMIN') : req.userPhone;
    const rows = await dbQuery('SELECT id FROM teachers WHERE telefon = ?', [checkPhone]);
    if (rows && rows.length > 0 && !req.isAdmin) {
      return res.status(400).json({ error: 'Zaten bir kayıt eklediniz. Önceki kaydınızı silmeden yeni kayıt ekleyemezsiniz.' });
    }

    const newId = id || Date.now();
    await dbQuery(
      `INSERT INTO teachers (id, ad, "mevcutAlan", "hedefAlan", puan, "sureYil", "sureAy", "sureToplam", "gorevIl", tercipler, "addedAt", "clientId", telefon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId, ad, mevcutAlan, hedefAlan, puan, sureYil, sureAy, sureToplam, 
        gorevIl, JSON.stringify(tercipler || []), addedAt || new Date().toISOString(), clientId, telefon
      ]
    );

    // Sync name back to users pool (admin list)
    if (telefon) {
      const cleanTel = String(telefon).replace(/\s+/g, '');
      await dbQuery('UPDATE users SET name = ? WHERE phone = ?', [ad, cleanTel]);
    }

    res.json({ success: true, id: newId });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Beritabanına kaydedilemedi' });
  }
});

// Remove a teacher
app.delete('/api/teachers/:id', checkAuth, async (req, res) => {
  const { id } = req.params;
  const clientId = req.headers['x-client-id'];
  const adminSecret = req.headers['x-admin-secret'];

  if (!clientId && !adminSecret) return res.status(400).json({ error: 'Yetkisiz işlem' });

  try {
    const rows = await dbQuery('SELECT id, telefon FROM teachers WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Kayıt bulunamadı' });
    
    if (!req.isAdmin && rows[0].telefon !== req.userPhone) {
      return res.status(403).json({ error: 'Sadece kendi eklediğiniz kaydı silebilirsiniz' });
    }

    const { changes } = await dbQuery('DELETE FROM teachers WHERE id = ?', [id]);
    res.json({ success: true, deleted: changes });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Kayıt silinirken hata oluştu' });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Simülasyon Server ${PORT} portunda çalışıyor...`);
});
