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
        console.log("✅ v2.1.0 SUPREME BRAIN ONLINE.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); dbStatus = "❌ ERR: " + error.message; }

app.use(cors());
app.use(bodyParser.json());

// --- 132-KEY PATH CONSTANTS (BUILD_003 ALIGNED) ---
const PATH = {
    BRANDING: 'config/system_branding',
    LOGIC: 'config/system_logic',
    VERIFY: 'config/verification_engine',
    GATEWAY: 'config/gateways',
    DNA: 'config/hardware_dna',
    USERS: 'users',
    TX: 'transactions',
    LEDGER: 'ledger',
    FORENSICS: 'forensics',
    SYNC: 'sync_room',
    AUDITS: 'audits',
    PERMS: 'api_permissions',
    REFS: 'used_receipt_ids'
};

const normalizePhone = (p) => { if (!p) return ""; const clean = p.toString().replace(/\D/g, ''); return clean.length >= 9 ? clean.slice(-9) : clean; };

const getNextImperialRef = async () => {
    if (!db) return "#000000";
    const ref = db.ref(PATH.LEDGER + '/097_receipt_counter');
    const res = await ref.transaction((c) => (c || 0) + 1);
    return "#" + res.snapshot.val().toString().padStart(6, '0');
};

const updateVerifiedLedger = async (amountUSD, type = 'ADD') => {
    if (!db) return;
    await db.ref(PATH.LEDGER + '/096_empire_verified_wealth_usd').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + parseFloat(amountUSD) : val - parseFloat(amountUSD);
    });
};

const stampDNA = async (phoneNumber, deviceId) => {
    if (!db || !deviceId) return;
    const ts = new Date().toISOString();
    await db.ref(PATH.USERS + '/' + phoneNumber + '/071_identity_dna_stamps/' + deviceId).set({ ts, seen: true });
    await db.ref(PATH.USERS + '/' + phoneNumber).update({ '072_current_dna': deviceId });
};

const logForensic = async (req, action, target, details = {}) => {
    if (!db) return;
    try {
        const ts = new Date().toISOString();
        const actor = req.user ? req.user.phoneNumber : "SYSTEM";
        const dna = req.user ? (req.user.deviceId || "WEB") : "UNK";
        const entry = { ts, actor, action, target, dna, details };
        await db.ref(PATH.FORENSICS + '/103_global_execution_feed').push().set(entry);
        if (req.user && (req.user.role === 'SUPPORT' || req.user.role === 'MASTER')) {
            await db.ref(PATH.FORENSICS + '/104_staff_dossiers/' + actor + '/actions').push().set(entry);
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
                const trusted = (await db.ref(PATH.DNA + '/058_trusted_devices').once('value')).val() || {};
                if (Object.keys(trusted).length > 0 && !trusted[user.deviceId]) return res.status(403).json({ message: "Untrusted Device DNA" });
            }
        }
        req.user = user; next();
    });
};

const isMaster = (req, res, next) => { if (req.user && req.user.role === 'MASTER') next(); else res.status(403).send("Master Only"); };
const isSupport = (req, res, next) => { if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next(); else res.status(403).send("Staff Only"); };

// --- CORE APIs (CONNECTED TO 132 NODES) ---

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (db && deviceId && ['eesi','maamulka','maamulka_2','sensor_primary'].includes(phoneNumber)) {
            const lock = (await db.ref(PATH.DNA + '/060_registry_lock_status').once('value')).val();
            if (lock !== 'LOCKED') await db.ref(PATH.DNA + '/059_pending_approval_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
        }
        if (phoneNumber === 'eesi' && password === MASTER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '24h' }), role: 'MASTER' });
        if (['maamulka', 'maamulka_2'].includes(phoneNumber)) {
            const p = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === p) return res.json({ token: jwt.sign({ phoneNumber, role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '24h' }), role: 'SUPPORT' });
        }
        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) return res.json({ token: jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '30d' }), role: 'LISTENER' });

        const clean = normalizePhone(phoneNumber);
        if (!db) return res.status(503).send("Offline");
        const userRef = db.ref(PATH.USERS + '/' + clean);
        const user = (await userRef.once('value')).val();
        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            await userRef.set({ '062_phoneNumber': clean, '063_password': password, '064_balanceUSD': 0.0, '065_status': 'PENDING', '067_createdAt': new Date().toISOString(), '132_isReviewer': false });
            return res.json({ message: "PENDING" });
        } else {
            if (!user || user['063_password'] !== password) return res.status(401).send("Fail");
            if (user['065_status'] === 'BLOCKED') return res.status(403).send("Blocked");
            await stampDNA(clean, deviceId);
            return res.json({
                token: jwt.sign({ phoneNumber: clean, role: 'USER', deviceId }, SECRET_KEY, { expiresIn: '30d' }),
                role: 'USER',
                '132_isReviewer': user['132_isReviewer'] || false
            });
        }
    } catch (e) { res.status(500).send("Err"); }
});

app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { transactionId, status } = req.body;
    const txRef = db.ref(PATH.TX + '/' + transactionId);
    const txData = (await txRef.once('value')).val();
    if (status === 'APPROVED' && txData['080_status'] === 'PENDING') {
        const uRef = db.ref(PATH.USERS + '/' + txData['076_userId']);
        const oldBal = (await uRef.once('value')).val()['064_balanceUSD'] || 0;
        const isOut = txData['077_type'].toLowerCase().includes("withdraw");
        const nBal = isOut ? oldBal - txData['078_amountUSD'] : oldBal + txData['078_amountUSD'];
        const iRef = await getNextImperialRef();
        await uRef.update({ '064_balanceUSD': nBal });
        await txRef.update({ '080_status': 'APPROVED', '087_approvedBy': req.user.phoneNumber, '082_prevBalance': oldBal, '083_newBalance': nBal, '081_imperialRef': iRef, '095_approval_ts': new Date().toISOString(), '088_dnaStamp': req.user.deviceId || "WEB" });
        await updateVerifiedLedger(txData['078_amountUSD'], isOut ? 'SUB' : 'ADD');
        await db.ref(PATH.FORENSICS + '/104_staff_dossiers/' + req.user.phoneNumber).transaction((s) => { if(s) s.total_approvals = (s.total_approvals || 0) + 1; return s; });

        // BUILD_003: Migrate ID to Approved Folder
        if (txData['086_externalId']) {
            await migrateId(txData['086_externalId'], 'approved');
        }
    }
    res.json({ message: "OK" });
});

// --- HELPER FOR BUILD_003: ID MIGRATION ENGINE ---
const checkDuplicateId = async (refId) => {
    if (!db || !refId) return false;
    const folders = ['approved', 'holding', 'manual_needed'];
    for (const f of folders) {
        const snap = await db.ref(PATH.REFS + '/' + f + '/' + refId).once('value');
        if (snap.val()) return true;
    }
    return false;
};

const migrateId = async (refId, target) => {
    if (!db || !refId) return;
    const folders = ['holding', 'manual_needed'];
    for (const f of folders) {
        await db.ref(PATH.REFS + '/' + f + '/' + refId).remove();
    }
    await db.ref(PATH.REFS + '/approved/' + refId).set({ ts: new Date().toISOString(), status: 'FINALIZED' });
};

app.post('/api/v1/gateway/pulse', async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { p_v1, p_v2, reportedBalanceSLSH, direction, refId } = req.body;

    // BUILD_003: Wall 1 - Double Spend Protection
    if (await checkDuplicateId(refId)) return res.status(400).send("Duplicate ID");

    try {
        const amtSLSH = parseInt(p_v1); const amtUSD = amtSLSH / 11000; const ph = normalizePhone(p_v2);
        const baseline = (await db.ref(PATH.VERIFY + '/023_lastKnownBaselineBalanceSLSH').once('value')).val() || 0;
        const expected = direction === 'OUT' ? baseline - amtSLSH : baseline + amtSLSH;

        // --- BATCH SYNC LOGIC ---
        if (Math.abs(expected - reportedBalanceSLSH) > 100) {
            const bufferRef = db.ref(PATH.SYNC + '/108_pulse_buffer');
            await bufferRef.push().set({ ts: new Date().toISOString(), ph, amtSLSH, refId, reportedBalanceSLSH });

            // BUILD_003: Move to Holding Folder
            await db.ref(PATH.REFS + '/holding/' + refId).set({ ts: new Date().toISOString(), ph, amtSLSH });

            const count = (await bufferRef.once('value')).numChildren();
            if (count >= 3) {
                await db.ref(PATH.VERIFY).update({ '023_lastKnownBaselineBalanceSLSH': reportedBalanceSLSH, '028_autoReleaseMode': 'INSTANT_RESET' });
                await bufferRef.remove();
                await logForensic({ user: { phoneNumber: 'SYSTEM' } }, "BATCH_RELEASED", "ALL", { count });
            }
            return res.json({ message: "BUFFERED" });
        }

        await db.ref(PATH.VERIFY).update({ '023_lastKnownBaselineBalanceSLSH': reportedBalanceSLSH, '029_lastReportedSmsRef': refId });
        if (direction === 'IN') {
            const txs = (await db.ref(PATH.TX).orderByChild('076_userId').equalTo(ph).once('value')).val() || {};
            const tid = Object.keys(txs).find(k => txs[k]['080_status'] === 'PENDING' && Math.abs(txs[k]['079_amountSLSH'] - amtSLSH) < 100);
            if (tid) {
                const uRef = db.ref(PATH.USERS + '/' + ph);
                const old = (await uRef.once('value')).val()['064_balanceUSD'] || 0;
                const n = old + amtUSD; const i = await getNextImperialRef();
                await uRef.update({ '064_balanceUSD': n });
                await db.ref(PATH.TX + '/' + tid).update({ '080_status': 'APPROVED', '086_externalId': refId, '082_prevBalance': old, '083_newBalance': n, '081_imperialRef': i, '090_result_snapshot': reportedBalanceSLSH });
                await updateVerifiedLedger(amtUSD, 'ADD');

                // BUILD_003: Final Approval Migration
                await migrateId(refId, 'approved');
            } else {
                // BUILD_003: Wall 3 - No Match Room (Manual Needed)
                await db.ref(PATH.REFS + '/manual_needed/' + refId).set({ ts: new Date().toISOString(), ph, amtSLSH, note: "No matching pending request" });
            }
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    if (!db) return res.status(503).send("Offline");
    const { type, amountSLSH, amountUSD, externalId } = req.body;
    const ph = req.user.phoneNumber;

    // Line 7 Logic: ZAAD_WITHDRAW (Subtracts from Balance)
    if (type === 'ZAAD_WITHDRAW') {
        const uRef = db.ref(PATH.USERS + '/' + ph);
        const uData = (await uRef.once('value')).val();
        const bal = parseFloat(uData['064_balanceUSD'] || 0);
        const reqUSD = parseFloat(amountUSD);

        if (bal < reqUSD) return res.status(400).send("Insufficient Balance");

        await uRef.update({ '064_balanceUSD': bal - reqUSD });
        await db.ref(PATH.TX).push().set({
            '076_userId': ph, '077_type': type, '079_amountSLSH': reqUSD * 10000, '078_amountUSD': reqUSD,
            '080_status': 'PENDING', '095_creation_ts': new Date().toISOString(), '082_prevBalance': bal, '083_newBalance': bal - reqUSD
        });
        return res.json({ message: "SUCCESS" });
    }

    // Line 6 Logic: 1XBET_WITHDRAW (Adds to balance on approval)
    if (type === '1XBET_WITHDRAW') {
        await db.ref(PATH.TX).push().set({
            '076_userId': ph, '077_type': type, '086_externalId': externalId, '080_status': 'PENDING', '095_creation_ts': new Date().toISOString()
        });
        return res.json({ message: "SUCCESS" });
    }

    // Default Logic for Other Deposits/Withdrawals
    await db.ref(PATH.TX).push().set({ '076_userId': ph, '077_type': type, '079_amountSLSH': amountSLSH, '078_amountUSD': amountSLSH / 11000, '080_status': 'PENDING', '095_creation_ts': new Date().toISOString() });
    res.json({ message: "SUCCESS" });
});

app.post('/api/v1/sup/security-lockdown', authenticate, isSupport, async (req, res) => {
    if (db) {
        const ph = normalizePhone(req.body.targetPhone);
        const updates = {};
        if (req.body.block !== undefined) updates['065_status'] = req.body.block ? 'BLOCKED' : 'ACTIVE';
        if (req.body.reviewer !== undefined) updates['132_isReviewer'] = req.body.reviewer;
        await db.ref(PATH.USERS + '/' + ph).update(updates);
    }
    res.json({ message: "OK" });
});

// --- REST OF APIs (ALL CONNECTED) ---
app.get('/api/v1/sup/meta-gate', async (req, res) => {
    if (!db) return res.json({ category: { banks: [] } });
    const snap = await db.ref(PATH.GATEWAY).once('value');
    const gateways = snap.val() || {};
    const bankList = Object.entries(gateways).map(([id, g]) => ({
        id,
        name: g['032_name'],
        icon: g['038_iconUrl'],
        color: g['039_brandColor'] || "#222",
        ussd: g['033_ussd'],
        targetNumber: g['034_targetNumber'],
        mathLabel: g['035_mathLabel'],
        status: g['036_gatewayStatus']
    }));
    res.json({ category: { title: "DHIG / KALA BAX", banks: bankList } });
});
app.get('/api/config', async (req, res) => res.json(db ? (await db.ref('config').once('value')).val() : {}));
app.post('/api/v1/sup/update-config', authenticate, isMaster, async (req, res) => { if (db) await db.ref('config').update(req.body); res.json({ message: "OK" }); });
app.get('/api/balance', authenticate, async (req, res) => { const u = db ? (await db.ref(PATH.USERS + '/' + req.user.phoneNumber).once('value')).val() : null; res.json({ balanceUSD: u ? u['064_balanceUSD'] : 0 }); });
app.get('/api/transactions', authenticate, async (req, res) => {
    if (!db) return res.json([]);
    const txs = Object.values((await db.ref(PATH.TX).orderByChild('076_userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value')).val() || {});
    res.json(txs.reverse());
});
app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => res.json(db ? (await db.ref(PATH.USERS).once('value')).val() || {} : {}));
app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => { if (db) await db.ref(PATH.USERS + '/' + req.body.targetPhone).update({ '065_status': 'ACTIVE' }); res.json({ message: "OK" }); });
app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => res.json(db ? Object.values((await db.ref(PATH.FORENSICS + '/103_global_execution_feed').limitToLast(100).once('value')).val() || {}).reverse() : []));
app.post('/api/v1/sup/delta-force', authenticate, isMaster, async (req, res) => { if (db) await db.ref(PATH.USERS + '/' + normalizePhone(req.body.targetPhone)).update({ '064_balanceUSD': parseFloat(req.body.newBalance) }); res.json({ message: "OK" }); });
app.get('/api/v1/sup/audits', authenticate, isMaster, async (req, res) => res.json(db ? (await db.ref(PATH.AUDITS).limitToLast(50).once('value')).val() || {} : {}));
app.post('/api/v1/sup/trust-device', authenticate, isMaster, async (req, res) => { if (!db) return res.status(503).send("Offline"); const snap = await db.ref(PATH.DNA + '/059_pending_approval_devices/' + req.body.deviceId).once('value'); if (snap.val()) { await db.ref(PATH.DNA + '/058_trusted_devices/' + req.body.deviceId).set(snap.val()); await db.ref(PATH.DNA + '/059_pending_approval_devices/' + req.body.deviceId).remove(); res.json({ message: "OK" }); } else res.status(404).send("Err"); });
app.post('/api/v1/ops/track-view', authenticate, isSupport, async (req, res) => { await logForensic(req, "VIEW_PASS", req.body.targetPhone); res.json({ message: "OK" }); });

// --- SUPREME MANAGEMENT APIs ---
app.get('/api/v1/sup/empire-stats', authenticate, isSupport, async (req, res) => {
    if (!db) return res.json({ pendingCount: 0 });
    const snap = await db.ref(PATH.TX).orderByChild('080_status').equalTo('PENDING').once('value');
    res.json({ pendingCount: Object.keys(snap.val() || {}).length });
});
app.get('/api/v1/sup/ledger-sheet', authenticate, isMaster, async (req, res) => {
    if (!db) return res.json({});
    const wealth = (await db.ref(PATH.LEDGER + '/096_empire_verified_wealth_usd').once('value')).val() || 0;
    const users = (await db.ref(PATH.USERS).once('value')).val() || {};
    const liab = Object.values(users).reduce((s, u) => s + (parseFloat(u['064_balanceUSD']) || 0), 0);
    res.json({ empireUSD: parseFloat(wealth), liabilitiesUSD: liab });
});
app.get('/api/v1/sup/search-users', authenticate, isSupport, async (req, res) => {
    if (!db) return res.json({});
    const q = req.query.q;
    const snap = await db.ref(PATH.USERS).orderByKey().startAt(q).endAt(q + "\uf8ff").limitToFirst(20).once('value');
    res.json(snap.val() || {});
});
app.get('/api/v1/sup/user-dna/:phone', authenticate, isSupport, async (req, res) => {
    if (!db) return res.json({});
    const ph = normalizePhone(req.params.phone);
    const profile = (await db.ref(PATH.USERS + '/' + ph).once('value')).val();
    const txs = Object.values((await db.ref(PATH.TX).orderByChild('076_userId').equalTo(ph).limitToLast(10).once('value')).val() || {});
    res.json({ profile, transactions: txs.reverse() });
});
app.post('/api/v1/sup/set-allowance', authenticate, isSupport, async (req, res) => { if (db) await db.ref(PATH.USERS + '/' + normalizePhone(req.body.targetPhone)).update({ '066_dailyLimitUSD': parseFloat(req.body.allowance) }); res.json({ message: "OK" }); });
app.get('/api/v1/sup/staff-directory', authenticate, isMaster, async (req, res) => { res.json({ activeStaff: db ? Object.keys((await db.ref(PATH.FORENSICS + '/104_staff_dossiers').once('value')).val() || {}) : [] }); });
app.get('/api/v1/sup/staff-dna/:phone', authenticate, isMaster, async (req, res) => { if (!db) return res.json([]); const snap = await db.ref(PATH.FORENSICS + '/104_staff_dossiers/' + req.params.phone + '/actions').limitToLast(100).once('value'); res.json(Object.values(snap.val() || {}).reverse()); });
app.get('/api/v1/sup/pending-devices', authenticate, isMaster, async (req, res) => { res.json(db ? (await db.ref(PATH.DNA + '/059_pending_approval_devices').once('value')).val() || {} : {}); });
app.post('/api/v1/sys/simulate', authenticate, isMaster, async (req, res) => { await logForensic(req, "SIMULATOR_PULSE", "SYSTEM", { pulse: "TEST_ZAAD_SUCCESS" }); res.json({ message: "OK" }); });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v2.1.0 Active.`));
