const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const unzipper = require('unzipper');
const moment = require('moment');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
let lastQr = '';
let isReady = false;

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccount.json');

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const AUTH_PATH = path.join(__dirname, '.auth_info');

// Session Persistence Logic
async function backupSession() {
    console.log('Backing up session to Firestore...');
    try {
        const output = path.join(__dirname, 'session.zip');
        const stream = fs.createWriteStream(output);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve, reject) => {
            stream.on('close', async () => {
                const buffer = await fs.readFile(output);
                // Split into chunks if > 1MB (Firestore limit)
                const base64 = buffer.toString('base64');
                await db.collection('system').doc('whatsapp-session').set({
                    data: base64,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                await fs.remove(output);
                console.log('Session backup complete.');
                resolve();
            });
            archive.on('error', reject);
            archive.pipe(stream);
            archive.directory(AUTH_PATH, false);
            archive.finalize();
        });
    } catch (err) {
        console.error('Backup failed:', err);
    }
}

async function restoreSession() {
    console.log('Checking for existing session in Firestore...');
    try {
        const doc = await db.collection('system').doc('whatsapp-session').get();
        if (doc.exists) {
            const data = doc.data().data;
            const buffer = Buffer.from(data, 'base64');
            const zipPath = path.join(__dirname, 'restore.zip');
            await fs.writeFile(zipPath, buffer);
            
            await fs.ensureDir(AUTH_PATH);
            await fs.createReadStream(zipPath)
                .pipe(unzipper.Extract({ path: AUTH_PATH }))
                .promise();
            
            await fs.remove(zipPath);
            console.log('Session restored successfully.');
            return true;
        }
    } catch (err) {
        console.error('Restore failed:', err);
    }
    return false;
}

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: AUTH_PATH
    }),
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
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null // Useful for custom environments
    }
});

// QR Code Generation
client.on('qr', (qr) => {
    lastQr = qr;
    console.log('QR RECEIVED. View it at /qr endpoint.');
    qrcode.generate(qr, { small: true });
});

// Client Authentication
client.on('authenticated', async () => {
    console.log('AUTHENTICATED');
    // We delay backup slightly to ensure session files are written
    setTimeout(backupSession, 10000);
});

client.on('auth_failure', msg => {
    console.error('AUTHENTICATION FAILURE', msg);
});

// Client Ready
client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    isReady = true;
    
    db.collection('system').doc('whatsapp-bot').set({
        status: 'online',
        lastSeen: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    startNotificationListener();
});

// Helper: Handle Incoming Messages to find IDs
client.on('message', async msg => {
    console.log(`Message from ${msg.from}: ${msg.body}`);

    // If you type !id in any group or chat, the bot will tell you the ID
    if (msg.body.toLowerCase() === '!id') {
        msg.reply(`The ID for this chat is: *${msg.from}*`);
        console.log(`CHAT ID DETECTED: ${msg.from}`);
    }
});

// Notification Engine
function startNotificationListener() {
    console.log('Starting notification listeners...');
    
    // 2. Judge Alerts (Polling-based for timing)
    // Runs every minute to check for programs starting in 10 minutes
    setInterval(checkUpcomingPrograms, 60000);
    checkUpcomingPrograms(); // Run once on start
}

async function checkUpcomingPrograms() {
    console.log('Checking for upcoming programs starting in 10 minutes...');
    try {
        const now = moment();
        const targetTime = now.clone().add(10, 'minutes');
        
        // We look for programs where time is set and within the next 10-11 minutes
        // And where we haven't sent the 10m alert yet
        const snapshot = await db.collection('programs')
            .where('judgeAlertSent', '==', false)
            .get();

        const venuesSnap = await db.collection('venues').get();
        const venues = {};
        venuesSnap.forEach(v => venues[v.id] = v.data().name);

        const judgesSnap = await db.collection('judges').get();
        const judges = {};
        judgesSnap.forEach(j => judges[j.id] = j.data());

        for (const doc of snapshot.docs) {
            const p = doc.data();
            if (!p.time) continue;

            const startTime = moment(p.time);
            const diffMinutes = startTime.diff(now, 'minutes');

            // If it's starting in 9-11 minutes, send the alert
            if (diffMinutes >= 9 && diffMinutes <= 11) {
                console.log(`Found program starting soon: ${p.name} (starts in ${diffMinutes}m)`);
                await sendJudgeAlert(doc.id, p, venues, judges, diffMinutes);
                
                // Mark as sent
                await db.collection('programs').doc(doc.id).update({ judgeAlertSent: true });
            }
        }
    } catch (err) {
        console.error('Error checking upcoming programs:', err);
    }
}

async function sendJudgeAlert(programId, program, venues, judges, minutesLeft) {
    const venueName = venues[program.venueId] || 'Not Assigned';
    
    // Collect all judges assigned to this program
    const assignedJudgeIds = [];
    for (let i = 1; i <= (program.judgeCount || 3); i++) {
        const jId = program[`judge${i}Id`];
        if (jId) assignedJudgeIds.push(jId);
    }

    const uniqueJudgeIds = [...new Set(assignedJudgeIds)];
    
    for (const jId of uniqueJudgeIds) {
        const judge = judges[jId];
        if (judge && judge.whatsapp) {
            let phone = judge.whatsapp.replace(/\D/g, '');
            if (!phone.startsWith('91') && phone.length === 10) phone = '91' + phone;
            const target = `${phone}@c.us`;

            const message = `*⏰ JUDGE ALERT: STARTING SOON! ⏰*\n\n` +
                          `Hello *${judge.name}*,\n\n` +
                          `The following program is scheduled to start in *${minutesLeft} minutes*:\n\n` +
                          `📌 *Program:* ${program.name}\n` +
                          `🔢 *Code:* ${program.code || 'N/A'}\n` +
                          `📍 *Venue:* ${venueName}\n` +
                          `🕒 *Time:* ${moment(program.time).format('hh:mm A')}\n\n` +
                          `Please proceed to the venue. Thank you! 🙏`;

            try {
                await client.sendMessage(target, message);
                console.log(`Alert sent to Judge ${judge.name} for ${program.name}`);
            } catch (err) {
                console.error(`Failed to send alert to Judge ${judge.name}:`, err);
            }
        }
    }
}

// Web Interface Endpoints
app.get('/', (req, res) => {
    res.send('<h1>WhatsApp Notification Server</h1><p>Status: ' + (isReady ? 'Online' : 'Offline') + '</p><a href="/qr">View QR Code</a>');
});

app.get('/pending', async (req, res) => {
    try {
        const snapshot = await db.collection('programs')
            .where('time', '!=', null)
            .where('judgeAlertSent', '==', false)
            .get();
        
        const programs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ count: programs.length, programs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/send-alerts', async (req, res) => {
    const { programId } = req.body;
    try {
        const venuesSnap = await db.collection('venues').get();
        const venues = {};
        venuesSnap.forEach(v => venues[v.id] = v.data().name);

        const judgesSnap = await db.collection('judges').get();
        const judges = {};
        judgesSnap.forEach(j => judges[j.id] = j.data());

        let query = db.collection('programs');
        if (programId) {
            query = query.doc(programId);
        } else {
            query = query.where('judgeAlertSent', '==', false);
        }

        const snapshot = programId ? await query.get() : await query.get();
        const docs = programId ? [snapshot] : snapshot.docs;
        
        let sentCount = 0;
        for (const doc of docs) {
            const p = doc.data();
            if (p.time) {
                await sendJudgeAlert(doc.id, p, venues, judges, 10); // Manual alert defaults to 10m text
                await db.collection('programs').doc(doc.id).update({ judgeAlertSent: true });
                sentCount++;
            }
        }

        res.json({ success: true, summary: { sent: sentCount, processed: docs.length } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/qr', (req, res) => {
    if (isReady) {
        return res.send('<h1>Already Connected!</h1><p>The WhatsApp client is already logged in and ready.</p>');
    }
    if (!lastQr) {
        return res.send('<h1>No QR Code Yet</h1><p>Please wait for the server to initialize...</p>');
    }
    
    // Simple HTML to show QR code
    res.send(`
        <html>
            <head>
                <title>WhatsApp Login</title>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
                <style>
                    body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f0f2f5; }
                    #qrcode { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    h1 { color: #128c7e; }
                </style>
            </head>
            <body>
                <h1>Scan with WhatsApp</h1>
                <div id="qrcode"></div>
                <p>Refresh page if QR doesn't appear.</p>
                <script>
                    new QRCode(document.getElementById("qrcode"), {
                        text: "${lastQr}",
                        width: 256,
                        height: 256
                    });
                </script>
            </body>
        </html>
    `);
});

// Start Server and WhatsApp
async function start() {
    await restoreSession();
    
    app.listen(PORT, () => {
        console.log(`Web server running at http://localhost:${PORT}`);
    });

    client.initialize();
}

start();

// Handle process termination for cleanup
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await client.destroy();
    process.exit(0);
});
