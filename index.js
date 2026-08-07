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

// Lista fija con los 10 dígitos principales de los administradores
const adminNumbers = [
    '7205553249', // Tu número
    '4623421390', 
    '970905290', 
    '9842416884',
    '6147914642', 
    '8261510387', 
    '7821662353',
    '996122609',
    '2616395161', 
    '554788902892',
    '6862456423', 
    '7821420226', 
    '6024871043',
    '978930965', 
    '7205552328',
    '9624023210', 
    '84477977', 
    '7773243291'
];

app.get('/', (req, res) => {
    if (qrImagen) {
        res.send(`<html><body style="background:#111; color:#fff; text-align:center; padding-top:50px;"><h2>Escanea el QR</h2><img src="${qrImagen}" width="300"/></body></html>`);
    } else {
        res.send(`<html><body style="background:#111; color:#fff; text-align:center; padding-top:50px;"><h2>Bot Conectado y Listo</h2></body></html>`);
    }
});
app.listen(process.env.PORT || 3000, () => console.log('Servidor web en línea'));

const misFotosFijas = ['Nuevos espiritus.jpeg', 'Todos los espiritus 1.jpeg', 'Todos los espiritus 2.jpeg'];
let cola = []; 
let numTurno = 1800; 
let fechaHoy = new Date().toDateString();
let registroDiario = {}; 
let turnosActivos = {}; 
let statsAdmins = {}; 

function revisarDia() {
    const hoy = new Date().toDateString();
    if (fechaHoy !== hoy) {
        fechaHoy = hoy;
        registroDiario = {};
        cola = [];
    }
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const sock = makeWASocket({ auth: state, printQRInTerminal: false, logger: pino({ level: 'silent' }) });

    sock.ev.on('connection.update', (update) => {
        const { connection, qr, lastDisconnect } = update;
        if (qr) qrcode.toDataURL(qr, (err, url) => { qrImagen = url; });
        if (connection === 'open') { qrImagen = ''; console.log('=== BOT CONECTADO ULTRA RÁPIDO ==='); }
        else if (connection === 'close') { 
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                startBot();
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const chatJid = m.key.remoteJid;
        const sender = m.key.participant || chatJid;
        const cleanSender = sender.replace(/:\d+@/, '@');
        
        // Extracción infalible de los dígitos del remitente
        const senderDigits = cleanSender.replace(/\D/g, '');
        const isUserAdmin = adminNumbers.some(num => senderDigits.includes(num));
        
        let rawText = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
        const texto = rawText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s@]/g, "").trim();

        revisarDia();

        const reply = async (text, options = {}) => {
            await sock.sendMessage(chatJid, { text, ...options }, { quoted: m });
        };

        // Bloquear comandos exclusivos de soporte si no es admin
        const isAdminCommand = texto.startsWith('addsoporte') || 
                               texto.startsWith('delsoporte') || 
                               texto === 'listaadmins' || 
                               texto === 'siguiente' || 
                               texto === 'turnos' || 
                               texto.startsWith('atendido');

        if (isAdminCommand && !isUserAdmin) {
            return reply('⚠️ No eres miembro de soporte.');
        }

        // ==========================================
        // GESTIÓN DINÁMICA DE ADMINS
        // ==========================================
        if (texto.startsWith('addsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const targetDigits = mentioned[0].replace(/\D/g, '').slice(-10);
                if (!adminNumbers.includes(targetDigits)) {
                    adminNumbers.push(targetDigits);
                    return reply(`✅ @${mentioned[0].split('@')[0]} ahora es administrador.`);
                } else {
                    return reply(`⚠️ Esa persona ya es administrador.`);
                }
            } else {
                return reply(`⚠️ Debes etiquetar a la persona (ej: addsoporte @usuario).`);
            }
        }

        if (texto.startsWith('delsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const targetDigits = mentioned[0].replace(/\D/g, '').slice(-10);
                const index = adminNumbers.indexOf(targetDigits);
                if (index > -1) {
                    adminNumbers.splice(index, 1);
                    return reply(`✅ Eliminado de administradores.`);
                } else {
                    return reply(`⚠️ Ese usuario no estaba en la lista.`);
                }
            } else {
                return reply(`⚠️ Debes etiquetar a la persona a eliminar.`);
            }
        }

        if (texto === 'listaadmins') {
            return reply(`👑 *Administradores activos:*\n${adminNumbers.map(n => '• ' + n).join('\n')}`);
        }

        // ==========================================
        // PLANTILLAS PERSONALES (adplantilla / miplantilla)
        // ==========================================
        if (texto.includes('adplantilla')) {
            const imageMessage = m.message.imageMessage || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            if (imageMessage) {
                try {
                    const buffer = await downloadMediaMessage(
                        m,
                        'buffer',
                        {},
                        { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
                    );
                    const userPhone = senderDigits.slice(-10);
                    const filePath = path.join(__dirname, 'plantillas', `${userPhone}.jpg`);
                    fs.writeFileSync(filePath, buffer);
                    return reply('✅ ¡Plantilla guardada correctamente! Usa *miplantilla* para verla cuando quieras.');
                } catch (err) {
                    console.error(err);
                    return reply('⚠️ Error al guardar la imagen. Inténtalo de nuevo.');
                }
            } else {
                return reply('⚠️ Debes enviar una imagen adjunta escribiendo *adplantilla* en el texto o descripción.');
            }
        }

        if (texto === 'miplantilla') {
            const userPhone = senderDigits.slice(-10);
            const filePath = path.join(__dirname, 'plantillas', `${userPhone}.jpg`);
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                await sock.sendMessage(chatJid, { image: buffer, caption: '📌 Tu plantilla guardada:' }, { quoted: m });
                return;
            } else {
                return reply('⚠️ No tienes ninguna plantilla guardada. Manda una foto con la palabra *adplantilla* para registrarla.');
            }
        }

        // ==========================================
        // COMANDOS PÚBLICOS
        // ==========================================
        if (texto === 'turno') {
            if (!registroDiario[cleanSender]) registroDiario[cleanSender] = 0;
            
            if (registroDiario[cleanSender] >= 2) {
                return reply('❌ Ya agotaste tus 2 ayudas del día de hoy.');
            }
            if (cola.some(t => t.sender === cleanSender) || turnosActivos[cleanSender]) {
                return reply('⚠️ Ya estás en la fila o tienes un turno activo.');
            }

            const idTurno = 'T' + numTurno;
            cola.push({ 
                id: idTurno, 
                sender: cleanSender, 
                tiempoRegistro: Date.now() 
            });
            numTurno++;
            
            return reply(`✅ *Turno generado exitosamente: ${idTurno}*\nEspera tu llamado en el grupo.\n\n📊 *Ayudas solicitadas hoy:* ${registroDiario[cleanSender]}/2`);
        }

        const palabrasConfirmacion = ['aqui', 'confirmo', 'presente'];
        if (palabrasConfirmacion.includes(texto)) {
            if (turnosActivos[cleanSender]) {
                clearTimeout(turnosActivos[cleanSender].timer); 
                const turnoId = turnosActivos[cleanSender].id;
                delete turnosActivos[cleanSender]; 
                
                registroDiario[cleanSender] += 1; 
                return reply(`✅ Confirmado (Turno ${turnoId}). Llevas ${registroDiario[cleanSender]}/2 ayudas hoy. ¡Procedan!`);
            } else {
                const enCola = cola.some(t => t.sender === cleanSender);
                if (enCola) {
                    return reply('⏳ Todavía no has sido llamado. Espera a que el soporte te llame con el comando *siguiente*.');
                } else {
                    return reply('⚠️ No tienes ningún turno activo ni estás en la fila. Escribe *turno* para solicitar uno.');
                }
            }
        }

        if (texto === 'plantilla') {
            try {
                let enviadas = 0;
                for (const foto of misFotosFijas) {
                    if (fs.existsSync('./' + foto)) {
                        const buffer = fs.readFileSync('./' + foto);
                        await sock.sendMessage(chatJid, { image: buffer });
                        enviadas++;
                    }
                }
                if (enviadas === 0) {
                    return reply('⚠️ Error: No se encontraron las imágenes fijas en el servidor.');
                }
            } catch (error) {
                console.error(error);
                return reply('⚠️ Error al enviar las plantillas.');
            }
        }

        // ==========================================
        // COMANDOS DE SOPORTE (Solo admins)
        // ==========================================
        if (texto === 'siguiente') {
            if (cola.length === 0) return reply('📭 No hay nadie en la fila.');

            const turnoActual = cola.shift(); 
            
            if (!statsAdmins[cleanSender]) statsAdmins[cleanSender] = 0;
            statsAdmins[cleanSender]++;
            
            let rango = "Soporte Técnico";
            if (statsAdmins[cleanSender] >= 50) rango = "Veterano";
            if (statsAdmins[cleanSender] >= 100) rango = "👑 Rey del Soporte";

            const userPhone = turnoActual.sender.split('@')[0];
            const adminPhone = cleanSender.split('@')[0];

            const msgLlamado = `📢 *TURNO EN ATENCIÓN*

🎫 Turno:
*${turnoActual.id}*

👤 Usuario:
@${userPhone}
________________________

✅ PARA CONFIRMAR TU TURNO RESPONDE:

• aqui
• confirmo
• presente

⏳ Tienes *3 minutos* para responder.
________________________

📊 *INFORMACIÓN DEL TURNO*

🟡 Estado: LLAMADO

📍 Posición anterior: #1

👥 Personas delante: 0

🛡️ Soporte asignado:
@${adminPhone}
________________________

🕵️‍♂️ *INFORMACIÓN DEL SOPORTE*

🎫 Turnos atendidos: ${statsAdmins[cleanSender]}

🎖️ Rango:
${rango}
________________________

⚠️ Si no confirmas dentro del tiempo límite, el turno será finalizado automáticamente y tendrás que solicitar uno nuevo.

🤖 Sistema de Gestión de Turnos`;

            await sock.sendMessage(chatJid, {
                text: msgLlamado,
                mentions: [turnoActual.sender, cleanSender]
            });

            turnosActivos[turnoActual.sender] = {
                id: turnoActual.id,
                timer: setTimeout(async () => {
                    await sock.sendMessage(chatJid, {
                        text: `❌ @${userPhone} no respondió. El turno ${turnoActual.id} ha sido finalizado automáticamente.`,
                        mentions: [turnoActual.sender]
                    });
                    
                    registroDiario[turnoActual.sender] = (registroDiario[turnoActual.sender] || 0) + 1;
                    delete turnosActivos[turnoActual.sender];
                }, 180000)
            };
            return;
        }

        if (texto === 'turnos') {
            if (cola.length === 0) return reply('📭 La fila está vacía.');
            
            let lista = `📋 *LISTA DE TURNOS*\n\n📊 Total en cola: ${cola.length}\n\n`;
            const ahora = Date.now();

            cola.forEach((t) => {
                const minEspera = Math.floor((ahora - t.tiempoRegistro) / 60000); 
                lista += `🎫 ${t.id}\n📌 Estado: PENDIENTE\n👤 @${t.sender.split('@')[0]}\n⏳ Espera: ${minEspera} min\n\n`;
            });

            return sock.sendMessage(chatJid, { text: lista, mentions: cola.map(t => t.sender) });
        }

        if (texto.startsWith('atendido')) {
            const partes = texto.split(/\s+/);
            const idBuscar = partes.find(p => p.startsWith('t'));
            
            if (!idBuscar) return reply('⚠️ Usa el formato: Atendido T1800');
            
            const idMayus = idBuscar.toUpperCase();
            const index = cola.findIndex(t => t.id === idMayus);
            
            if (index !== -1) {
                const removido = cola.splice(index, 1)[0];
                registroDiario[removido.sender] = (registroDiario[removido.sender] || 0) + 1;
                
                if (!statsAdmins[cleanSender]) statsAdmins[cleanSender] = 0;
                statsAdmins[cleanSender]++;

                return reply(`✅ Turno ${idMayus} retirado de la fila y marcado como atendido.`);
            } else {
                return reply(`⚠️ No se encontró el turno ${idMayus} en la fila.`);
            }
        }
    });
}

startBot();
