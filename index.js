const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');
const pino = require('pino');

const app = express();
let qrImagen = ''; 

if (!fs.existsSync('./plantillas')) fs.mkdirSync('./plantillas');
if (!fs.existsSync('./auth_info_baileys')) fs.mkdirSync('./auth_info_baileys');

// Lista de admins con múltiples formatos para evitar errores
// Incluye: JID completo, número con 521, número con 52, y solo los 10 dígitos
let admins = [
    '5217205553249', '7205553249', '527205553249',
    '34623421390', '4623421390',
    '51970905290', '970905290',
    '5219842416884', '9842416884', '529842416884',
    '5216147914642', '6147914642', '526147914642',
    '5218261510387', '8261510387', '528261510387',
    '5217821662353', '7821662353', '527821662353',
    '593996122609', '996122609',
    '5492616395161', '2616395161',
    '554788902892', '554788902892',
    '5216862456423', '6862456423', '526862456423',
    '5217821420226', '7821420226', '527821420226',
    '16024871043', '6024871043',
    '593978930965', '978930965',
    '5217205552328', '7205552328', '527205552328',
    '5219624023210', '9624023210', '529624023210',
    '50684477977', '84477977',
    '5217773243291', '7773243291', '527773243291'
];

// Función para verificar si el usuario es admin comparando si el JID contiene alguna variante
function isUserAdminCheck(senderJid, adminList) {
    if (!senderJid) return false;
    // Buscamos si cualquiera de los números de la lista está contenido en el JID del remitente
    return adminList.some(admin => senderJid.includes(admin));
}

app.get('/', (req, res) => {
    if (qrImagen) {
        res.send(`<html><body style="background:#111; color:#fff; text-align:center; padding-top:50px;"><h2>Escanea el QR</h2><img src="${qrImagen}" width="300"/></body></html>`);
    } else {
        res.send(`<html><body style="background:#111; color:#fff; text-align:center; padding-top:50px;"><h2>Bot Conectado y Listo</h2></body></html>`);
    }
});
app.listen(process.env.PORT || 3000);

const misFotosFijas = ['Nuevos espiritus.jpeg', 'Todos los espiritus 1.jpeg', 'Todos los espiritus 2.jpeg'];
let cola = [], numTurno = 1800, fechaHoy = new Date().toDateString(), registroDiario = {}, turnosActivos = {}, statsAdmins = {};

function revisarDia() {
    const hoy = new Date().toDateString();
    if (fechaHoy !== hoy) { fechaHoy = hoy; registroDiario = {}; cola = []; }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: pino({ level: 'silent' }) });

    sock.ev.on('connection.update', (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) qrcode.toDataURL(qr, (err, url) => { qrImagen = url; });
        if (connection === 'open') { qrImagen = ''; console.log('=== BOT CONECTADO ==='); }
        else if (connection === 'close') { if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot(); }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const chatJid = m.key.remoteJid;
        const sender = m.key.participant || chatJid;
        const cleanSender = sender.replace(/:\d+@/, '@');
        
        let rawText = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
        const texto = rawText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s@]/g, "").trim();
        
        const isUserAdmin = isUserAdminCheck(cleanSender, admins);
        
        // Log para ver qué número está intentando usar el comando
        console.log(`[DEBUG] Usuario: ${cleanSender} | Es Admin: ${isUserAdmin}`);

        const reply = async (text, options = {}) => await sock.sendMessage(chatJid, { text, ...options }, { quoted: m });

        const isAdminCommand = texto.startsWith('addsoporte') || texto.startsWith('delsoporte') || texto === 'listaadmins' || texto === 'siguiente' || texto === 'turnos' || texto.startsWith('atendido');

        if (isAdminCommand && !isUserAdmin) return reply('⚠️ No eres miembro de soporte.');

        if (texto.startsWith('addsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const nuevoAdmin = mentioned[0].replace(/\D/g, ''); // Guardamos solo dígitos
                if (!admins.includes(nuevoAdmin)) {
                    admins.push(nuevoAdmin);
                    return reply(`✅ @${mentioned[0].split('@')[0]} ahora es admin.`);
                }
            }
        }
        
        if (texto.startsWith('delsoporte')) {
             const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
             if (mentioned && mentioned.length > 0) {
                 const num = mentioned[0].replace(/\D/g, '');
                 admins = admins.filter(a => !a.includes(num));
                 return reply(`✅ Eliminado.`);
             }
        }

        // ... (resto de tus comandos sin cambios) ...
        if (texto === 'turno') {
             if (!registroDiario[cleanSender]) registroDiario[cleanSender] = 0;
             if (registroDiario[cleanSender] >= 2) return reply('❌ Ya agotaste tus 2 ayudas.');
             const idTurno = 'T' + numTurno++;
             cola.push({ id: idTurno, sender: cleanSender, tiempoRegistro: Date.now() });
             return reply(`✅ Turno generado: ${idTurno}`);
        }

        const palabrasConfirmacion = ['aqui', 'confirmo', 'presente'];
        if (palabrasConfirmacion.includes(texto)) {
            if (turnosActivos[cleanSender]) {
                clearTimeout(turnosActivos[cleanSender].timer);
                delete turnosActivos[cleanSender];
                registroDiario[cleanSender] = (registroDiario[cleanSender] || 0) + 1;
                return reply('✅ Confirmado.');
            } else {
                return reply('⚠️ No tienes turno activo.');
            }
        }

        if (texto === 'siguiente') {
            if (cola.length === 0) return reply('📭 Fila vacía.');
            const turnoActual = cola.shift();
            // ... (logica de siguiente) ...
            return reply(`📢 Llamando a turno ${turnoActual.id}`);
        }
        
        if (texto === 'turnos') {
            if (cola.length === 0) return reply('📭 Fila vacía.');
            return reply(`📋 ${cola.length} turnos en cola.`);
        }
    });
}
startBot();
