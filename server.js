const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifkeenaSecret786';

const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const SUPPORT_PASS_2 = process.env.SUPPORT_ADMIN_PASS_2 || 'Support@VIP';
const LISTENER_PASS = process.env.LISTENER_PASS || 'Sensor@786';

let db = null;
let dbStatus = "🔴 OFFLINE";

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        dbStatus = "🟢 ONLINE";
        console.log("✅ v1.9.6 SUPREME BRAIN ONLINE.");
    }
} catch (error) {
    console.error("❌ DB Error:", error.message);
    dbStatus = "❌ ERR: " + error.message;
}

app.use(cors());
app.use(bodyParser.json());

// --- SUPREME UTILS ---
const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const getNextImperialRef = async () => {
    if (!db) return "#000000";
    const ref = db.ref('ledger/receipt_counter');
    const result = await ref.transaction((current) => (current || 0) + 1);
    return "#" + result.snapshot.val().toString().padStart(6, '0');
};

const updateVerifiedLedger = async (amountUSD, type = 'ADD') => {
    if (!db) return;
    await db.ref('ledger/verified_balance').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + parseFloat(amountUSD) : val - parseFloat(amountUSD);
    });
};

const logBalanceChange = async (phoneNumber, amountUSD, type, oldBal, newBal, reason, actor) => {
    if (!db) return;
    const event = { ts: new Date().toISOString(), amountUSD, type, oldBal, newBal, reason, actor };
    await db.ref('ledger/balance_logs/' + phoneNumber).push().set(event);
    await db.ref('global_forensics').push().set({ ...event, phoneNumber, action: 'BAL_' + type });
};

const logForensic = async (req, action, target, details = {}) => {
    if (!db) return;
    try {
        const entry = {
            ts: new Date().toISOString(),
            actor: req.user ? req.user.phoneNumber : "SYSTEM",
            role: req.user ? req.user.role : "N/A",
            action, target,
            dna: req.user ? (req.user.deviceId || "WEB") : "UNK",
            details
        };
        await db.ref('activity_logs').push().set(entry);
        await db.ref('global_forensics').push().set(entry);
        if (req.user && (req.user.role === 'SUPPORT' || req.user.role === 'MASTER')) {
            await db.ref('staff_activity/' + req.user.phoneNumber).push().set(entry);
        }
    } catch (e) {}
};

// --- AUTH MIDDLEWARE ---
const authenticate = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, async (err, user) => {
        if (err) return res.sendStatus(403);
        if (user.role === 'MASTER' || user.role === 'SUPPORT' || user.role === 'LISTENER') {
            if (db) {
                const trustSnap = await db.ref('config/trusted_devices').once('value');
                const trusted = trustSnap.val() || {};
                if (Object.keys(trusted).length > 0 && !trusted[user.deviceId]) {
                    return res.status(403).json({ message: "Untrusted Device DNA" });
                }
            }
        }
        req.user = user;
        next();
    });
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Staff Only" });
};

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Only" });
};

// --- MASTER VAULT HTML ---
const masterHtml = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>SARIFKEENA MASTER VAULT</title>
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<style>:root{--gold:#ffc107;--green:#00c853;--bg:#050505;}body{background:var(--bg);color:#f0f0f0;font-family:sans-serif;}.card{background:#111;border:1px solid #222;border-radius:16px;padding:15px;margin-bottom:12px;}.btn-master{background:var(--gold);color:black;border:none;font-weight:800;border-radius:10px;}.nav-tabs{border:none;background:#0a0a0a;padding:10px;border-radius:14px;margin-bottom:20px;display:flex;flex-wrap:nowrap;overflow-x:auto;}.nav-link{color:#555;border:none!important;font-size:0.7rem;font-weight:700;white-space:nowrap;}.nav-link.active{color:var(--gold)!important;background:transparent!important;border-bottom:2px solid var(--gold)!important;}#login{height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at center, #1a1a00, #000);}.forensic-log{font-size:0.7rem;border-left:3px solid var(--gold);padding:8px;background:#0a0a0a;margin-bottom:5px;}.badge-usd{background:rgba(255,193,7,0.1);color:var(--gold);border:1px solid var(--gold);}</style></head>
<body>
<div id="login"><div class="card text-center" style="width:320px;"><h2 style="font-weight:900;color:var(--gold);">MASTER VAULT</h2><small class="text-muted">DB: ${dbStatus}</small><input type="password" id="k" class="form-control text-center my-4 bg-dark text-white border-secondary" placeholder="MASTER KEY"><button onclick="doLogin()" class="btn btn-master w-100 py-3">UNLOCK VAULT</button><div id="err" class="text-danger mt-2 small fw-bold"></div></div></div>
<div id="ui" style="display:none;" class="container-fluid py-3">
<header class="d-flex justify-content-between mb-3 px-2"><h4>SARIFKEENA MASTER</h4><button onclick="location.reload()" class="btn btn-sm btn-outline-danger"><i class="fas fa-power-off"></i></button></header>
<ul class="nav nav-tabs shadow-sm" role="tablist">
<li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#q">QUEUE</a></li>
<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#act" onclick="refreshAct()">ACTIVATE</a></li>
<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#f" onclick="refreshFeed()">FEED</a></li>
<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#fin" onclick="loadFin()">FINANCE</a></li>
<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#staff" onclick="loadStaff()">STAFF</a></li>
<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#dev" onclick="loadDev()">DEVICES</a></li>
<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#sys">SYSTEM</a></li>
</ul>
<div class="tab-content">
<div class="tab-pane fade show active" id="q"><div id="q-list"></div></div>
<div class="tab-pane fade" id="act"><div id="act-list"></div></div>
<div class="tab-pane fade" id="f"><div id="feed-list" style="max-height:70vh;overflow-y:auto;"></div></div>
<div class="tab-pane fade" id="fin"><div id="fin-box"></div></div>
<div class="tab-pane fade" id="staff"><div id="staff-box"></div></div>
<div class="tab-pane fade" id="dev">
<div class="card d-flex flex-row justify-content-between align-items-center"><b>DNA REGISTRY STATUS</b><button onclick="lockReg()" class="btn btn-sm btn-danger px-3">SEAL REGISTRY</button></div>
<div id="dev-list"></div>
</div>
<div class="tab-pane fade" id="sys"><div class="card"><h6 class="mb-3 fw-bold">STEALTH CONTROLS</h6><button onclick="toggleGhost()" class="btn btn-outline-warning w-100 mb-2">TOGGLE REVIEWER MODE</button><input type="number" id="seq-val" class="form-control mb-2" placeholder="New Serial #"><button onclick="resetSeq()" class="btn btn-outline-light w-100">RESET SERIAL TO #000001</button></div></div>
</div></div>
<div class="modal fade" id="m" tabindex="-1"><div class="modal-dialog"><div class="modal-content bg-dark border-secondary"><div class="modal-header border-secondary text-white"><h5 id="m-title">Details</h5><button class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div><div class="modal-body" id="m-body"></div></div></div></div>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
<script>
let t=""; let curDna="";
async function doLogin(){
    const p=document.getElementById('k').value;
    const res=await fetch('/api/v1/user/auth-access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phoneNumber:'eesi',password:p,mode:'login',deviceId:'MASTER_WEB'})});
    const d=await res.json();
    if(d.token&&d.role==='MASTER'){
        t="Bearer "+d.token; document.getElementById('login').style.display='none'; document.getElementById('ui').style.display='block'; fetchQ();
    } else { document.getElementById('err').innerText="DENIED: MASTER ONLY"; }
}
async function fetchQ(){
    const res=await fetch('/api/admin/transactions',{headers:{'Authorization':t}});
    const txs=await res.json();
    document.getElementById('q-list').innerHTML=Object.entries(txs).reverse().map(([id,x])=>\`
        <div class="card d-flex flex-row justify-content-between align-items-center">
            <div onclick="openUserDNA('\${x.userId}')" style="cursor:pointer"><b>$ \${x.amountUSD?.toFixed(2)}</b><br><small class="text-muted">\${x.type} | 6\${x.userId?.slice(-8)}</small></div>
            \${x.status==='PENDING' ? \`<button onclick="app('\${id}')" class="btn btn-master btn-sm px-4">OK</button>\` : \`<span class="badge \${x.status==='APPROVED'?'bg-success':'bg-danger'}">\${x.status}</span>\`}
        </div>\`).join('') || '<p class="text-center mt-5">Vault Clear</p>';
}
async function app(id){ await fetch('/api/v1/queue/update-state',{method:'POST',headers:{'Authorization':t,'Content-Type':'application/json'},body:JSON.stringify({transactionId:id,status:'APPROVED'})}); fetchQ(); }
async function refreshAct(){
    const res=await fetch('/api/admin/all-users',{headers:{'Authorization':t}});
    const us=await res.json();
    document.getElementById('act-list').innerHTML=Object.entries(us).filter(u=>u[1].status==='PENDING').map(([ph,u])=>\`
        <div class="card d-flex flex-row justify-content-between align-items-center"><b>6\${ph.slice(-8)}</b><button onclick="actUser('\${ph}')" class="btn btn-master btn-sm px-4">ACTIVATE</button></div>\`).join('') || '<p class="text-center mt-5">No Pending Users</p>';
}
async function actUser(ph){ await fetch('/api/admin/user/activate',{method:'POST',headers:{'Authorization':t,'Content-Type':'application/json'},body:JSON.stringify({targetPhone:ph})}); refreshAct(); }
async function refreshFeed(){
    const res=await fetch('/api/admin/global-forensics',{headers:{'Authorization':t}});
    const lgs=await res.json();
    document.getElementById('feed-list').innerHTML=lgs.map(l=>\`<div class="forensic-log"><b>\${l.action}</b><br><small>\${l.actor} | \${l.target || 'System'} | \${l.ts?.slice(11,16)}</small></div>\`).join('');
}
async function loadFin(){
    const res=await fetch('/api/v1/sup/ledger-sheet',{headers:{'Authorization':t}});
    const d=await res.json();
    document.getElementById('fin-box').innerHTML=\`
        <div class="card text-center py-4 mb-3"><div class="text-muted small">EMPIRE VERIFIED BALANCE</div><h2 class="text-success fw-black">$ \${d.empireUSD?.toFixed(2)}</h2></div>
        <div class="card text-center py-4"><div class="text-muted small">TOTAL USER LIABILITIES</div><h2 class="text-danger fw-black">$ \${d.liabilitiesUSD?.toFixed(2)}</h2></div>\`;
}
async function loadStaff(){
    const res=await fetch('/api/v1/sup/staff-directory',{headers:{'Authorization':t}});
    const d=await res.json();
    document.getElementById('staff-box').innerHTML=d.activeStaff.map(s=>\`
        <div class="card d-flex flex-row justify-content-between align-items-center" onclick="openStaffDNA('\${s}')" style="cursor:pointer">
            <b>\${s.toUpperCase()}</b><i class="fas fa-chevron-right text-muted"></i>
        </div>\`).join('');
}
async function openStaffDNA(ph){
    const res=await fetch('/api/v1/sup/staff-dna/'+ph, {headers:{'Authorization':t}});
    const lgs=await res.json();
    document.getElementById('m-title').innerText="Staff DNA: "+ph;
    document.getElementById('m-body').innerHTML=lgs.map(l=>\`<div class="forensic-log"><b>\${l.action}</b><br><small>\${l.target} | \${l.ts?.slice(0,16)}</small></div>\`).join('') || 'No Activity Found';
    new bootstrap.Modal(document.getElementById('m')).show();
}
async function openUserDNA(ph){
    const res=await fetch('/api/v1/sup/user-dna/'+ph, {headers:{'Authorization':t}});
    const d=await res.json();
    document.getElementById('m-title').innerText="User DNA: 6"+ph.slice(-8);
    document.getElementById('m-body').innerHTML=\`
        <div class="alert badge-usd text-center">Wallet: <b>$ \${d.profile.balance?.toFixed(2)}</b></div>
        <button onclick="ban('\${ph}', true)" class="btn btn-danger w-100 mb-2">BAN ACCOUNT</button>
        <button onclick="ban('\${ph}', false)" class="btn btn-success w-100 mb-3">RESTORE ACCOUNT</button>
        <h6 class="small fw-bold">LAST ACTIONS</h6>
        \${d.transactions?.slice(0,10).map(tx=>\`<div class="forensic-log">\${tx.type} | $\${tx.amountUSD} | \${tx.status}</div>\`).join('')}\`;
    new bootstrap.Modal(document.getElementById('m')).show();
}
async function ban(ph, b){ await fetch('/api/v1/sup/security-lockdown',{method:'POST',headers:{'Authorization':t,'Content-Type':'application/json'},body:JSON.stringify({targetPhone:ph, block:b})}); alert('Security Status Updated'); }
async function loadDev(){
    const res=await fetch('/api/v1/sup/pending-devices',{headers:{'Authorization':t}});
    const ds=await res.json();
    document.getElementById('dev-list').innerHTML=Object.entries(ds).map(([id,d])=>\`
        <div class="card d-flex flex-row justify-content-between align-items-center">
            <div><b>\${d.role} Login</b><br><small class="text-muted">ID: \${id.slice(0,12)}...</small></div>
            <button onclick="trust('\${id}')" class="btn btn-success btn-sm px-4">TRUST</button>
        </div>\`).join('') || '<p class="text-center mt-5">No Pending DNA</p>';
}
async function trust(id){ await fetch('/api/v1/sup/trust-device',{method:'POST',headers:{'Authorization':t,'Content-Type':'application/json'},body:JSON.stringify({deviceId:id})}); loadDev(); }
async function lockReg(){ if(confirm("Seal DNA Registry Forever?")) await fetch('/api/v1/sup/update-config',{method:'POST',headers:{'Authorization':t,'Content-Type':'application/json'},body:JSON.stringify({registryLocked:true})}); }
async function toggleGhost(){ await fetch('/api/v1/sup/update-config',{method:'POST',headers:{'Authorization':t,'Content-Type':'application/json'},body:JSON.stringify({globalReviewerMode:true})}); alert('Ghost Mode Active'); }
async function resetSeq(){ const v=document.getElementById('seq-val').value; if(v) await fetch('/api/v1/sup/sequence-set',{method:'POST',headers:{'Authorization':t,'Content-Type':'application/json'},body:JSON.stringify({startFrom:v})}); alert('Serial Reset'); }
setInterval(()=>{if(t)fetchQ();},20000);
</script></body></html>`;

const staffHtml = `<!DOCTYPE html><html><head><title>STAFF TERMINAL</title></head><body style="background:#050505;color:white;text-align:center;padding:50px;"><h1>STAFF TERMINAL</h1><p>Operational access pending.</p></body></html>`;

app.get('/master-vault', (req, res) => res.send(masterHtml));
app.get('/staff-panel', (req, res) => res.send(staffHtml));

// --- 42 SUPREME APIs REGISTRY ---

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (db) {
            const config = (await db.ref('config').once('value')).val() || {};
            if (deviceId && !config.registryLocked && ['eesi','maamulka','maamulka_2','sensor_primary'].includes(phoneNumber)) {
                await db.ref('config/pending_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
            }
        }
        if (phoneNumber === 'eesi' && password === MASTER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'MASTER' });
        if (['maamulka', 'maamulka_2'].includes(phoneNumber)) {
            const p = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === p) return res.json({ token: jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '12h' }), role: 'SUPPORT' });
        }
        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '30d' }), role: 'LISTENER' });

        const clean = normalizePhone(phoneNumber);
        if (!db) return res.status(503).send("Offline");
        const userRef = db.ref('users/' + clean);
        const user = (await userRef.once('value')).val();
        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            await userRef.set({ phoneNumber: clean, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING" });
        } else {
            if (!user || user.password !== password) return res.status(401).send("Fail");
            if (user.status === 'BLOCKED') return res.status(403).send("Blocked");
            return res.json({ token: jwt.sign({ phoneNumber: clean, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' }), role: 'USER' });
        }
    } catch (e) { res.status(500).send("Err"); }
});

app.get('/api/config', async (req, res) => res.json(db ? (await db.ref('config').once('value')).val() || {} : {}));
app.post('/api/v1/sup/update-config', authenticate, isMaster, async (req, res) => { if (db) await db.ref('config').update(req.body); res.json({ message: "OK" }); });
app.get('/api/balance', authenticate, async (req, res) => { const b = db ? (await db.ref('users/' + req.user.phoneNumber + '/balance').once('value')).val() : 0; res.json({ balanceUSD: parseFloat(b || 0) }); });
app.get('/api/transactions', authenticate, async (req, res) => {
    if (!db) return res.json([]);
    const txs = Object.values((await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value')).val() || {});
    res.json(txs.reverse().map(t => ({ ...t, externalId: t.status === 'APPROVED' ? t.imperialRef : "HUBIN..." })));
});
app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { type, amountSLSH } = req.body;
    await db.ref('transactions').push().set({ userId: req.user.phoneNumber, type, amountSLSH, amountUSD: amountSLSH / 11000, status: 'PENDING', date: new Date().toISOString() });
    res.json({ message: "SUCCESS" });
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref('users').once('value')).val() || {} : {}));
app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref('transactions').limitToLast(100).once('value')).val() || {} : {}));
app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { transactionId, status } = req.body;
    const txRef = db.ref('transactions/' + transactionId);
    const txData = (await txRef.once('value')).val();
    if (status === 'APPROVED' && txData.status === 'PENDING') {
        const uRef = db.ref('users/' + txData.userId);
        const oldBal = (await uRef.once('value')).val().balance || 0;
        const isOut = txData.type.toLowerCase().includes("withdraw");
        const nBal = isOut ? oldBal - txData.amountUSD : oldBal + txData.amountUSD;
        const iRef = await getNextImperialRef();
        await uRef.update({ balance: nBal });
        await txRef.update({ status: 'APPROVED', approvedBy: req.user.phoneNumber, prevBalance: oldBal, newBalance: nBal, imperialRef: iRef, approvalTime: new Date().toISOString() });
        await updateVerifiedLedger(txData.amountUSD, isOut ? 'SUB' : 'ADD');
    }
    res.json({ message: "OK" });
});
app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => { if (db) await db.ref('users/' + req.body.targetPhone).update({ status: 'ACTIVE' }); res.json({ message: "OK" }); });
app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => res.json(db ? Object.values((await db.ref('global_forensics').limitToLast(100).once('value')).val() || {}).reverse() : []));
app.get('/api/v1/sup/user-dna/:phone', authenticate, isSupport, async (req, res) => { if (!db) return res.json({}); const ph = normalizePhone(req.params.phone); res.json({ profile: (await db.ref('users/' + ph).once('value')).val(), transactions: Object.values((await db.ref('transactions').orderByChild('userId').equalTo(ph).limitToLast(10).once('value')).val() || {}) }); });
app.post('/api/v1/sup/trust-device', authenticate, isMaster, async (req, res) => { if (!db) return res.status(503).send("Offline"); const snap = await db.ref('config/pending_devices/' + req.body.deviceId).once('value'); if (snap.val()) { await db.ref('config/trusted_devices/' + req.body.deviceId).set(snap.val()); await db.ref('config/pending_devices/' + req.body.deviceId).remove(); res.json({ message: "OK" }); } else res.status(404).send("Err"); });
app.get('/api/v1/sup/pending-devices', authenticate, isMaster, async (req, res) => res.json(db ? (await db.ref('config/pending_devices').once('value')).val() || {} : {}));
app.get('/api/v1/sup/ledger-sheet', authenticate, isMaster, async (req, res) => { if (!db) return res.json({}); const v = (await db.ref('ledger/verified_balance').once('value')).val() || 0; const us = Object.values((await db.ref('users').once('value')).val() || {}); res.json({ empireUSD: parseFloat(v), liabilitiesUSD: us.reduce((s, u) => s + (u.balance || 0), 0) }); });
app.get('/api/v1/sup/staff-directory', authenticate, isMaster, async (req, res) => res.json({ activeStaff: db ? Object.keys((await db.ref('staff_activity').once('value')).val() || {}) : [] }));
app.get('/api/v1/sup/staff-dna/:phone', authenticate, isMaster, async (req, res) => { if (!db) return res.json([]); const ph = req.params.phone; const snap = await db.ref('staff_activity/' + ph).limitToLast(100).once('value'); res.json(Object.values(snap.val() || {}).reverse()); });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 Active.`));
