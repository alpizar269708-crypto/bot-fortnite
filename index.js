const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');
const pino = require('pino');

const app = express();
let qrImagen = ''; 

app.get('/', (req, res) => {
    if (qrImagen) {
        res.send(`
            <html>
                <head><title>Escanear Bot Fortnite</title></head>
                <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background:#111; color:#fff;">
                    <h2>Escanea este código con tu WhatsApp</h2>
                    <img src="${qrImagen}" style="border: 10px solid white; border-radius: 10px; width: 300px; height: 300px;"/>
                    <p>Conexión ultrarrápida activada.</p>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background:#111; color:#fff;">
                    <h2>¡Bot conectado y listo para la acción!</h2>
                </body>
            </html>
        `);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor web en línea'));

const admins = [
    '34623421390@s.whatsapp.net', '51970905290@s.whatsapp.net', '5219842416884@s.whatsapp.net',
    '5216147914642@s.whatsapp.net', '5218261510387@s.whatsapp.net', '5217821662353@s.whatsapp.net',
    '5219624023210@s.whatsapp.net', '50684477977@s.whatsapp.net', '5217773243291@s.whatsapp.net',
    '593996122609@s.whatsapp.net', '5492616395161@s.whatsapp.net', '554788902892@s.whatsapp.net',
    '5216862456423@s.whatsapp.net', '5217821420226@s.whatsapp.net', '16024871043@s.whatsapp.net',
    '593978930965@s.whatsapp.net', '5217205552328@s.whatsapp.net'
]; 

const misFotos = [
    'Nuevos espiritus.jpeg',
    'Todos los espiritus 1.jpeg',
    'Todos los espiritus 2.jpeg'
];

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
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            qrcode.toDataURL(qr, (err, url) => {
                qrImagen = url;
            });
        }
        if (connection === 'open') {
            qrImagen = '';
            console.log('=== BOT CONECTADO ULTRA RÁPIDO ===');
        } else if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
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

        const messageType = Object.keys(m.message)[0];
        let texto = '';
        if (messageType === 'conversation') {
            texto = m.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
            texto = m.message.extendedTextMessage.text;
        }
        texto = texto ? texto.toLowerCase().trim() : '';

        const isUserAdmin = admins.some(admin => cleanSender.includes(admin.split('@')[0]));

        revisarDia();

        const reply = async (text, options = {}) => {
            await sock.sendMessage(chatJid, { text, ...options }, { quoted: m });
        };

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

        const palabrasConfirmacion = ['aqui', 'aquí', 'confirmo', 'presente', '.aqui', '.aquí', '.confirmo', '.presente'];
        if (palabrasConfirmacion.includes(texto)) {
            if (turnosActivos[cleanSender]) {
                clearTimeout(turnosActivos[cleanSender].timer); 
                const turnoId = turnosActivos[cleanSender].id;
                delete turnosActivos[cleanSender]; 
                
                registroDiario[cleanSender] += 1; 
                return reply(`✅ Confirmado (Turno ${turnoId}). Llevas ${registroDiario[cleanSender]}/2 ayudas hoy. ¡Procedan!`);
            }
        }

        if (texto === 'plantilla') {
            try {
                let enviadas = 0;
                for (const foto of misFotos) {
                    if (fs.existsSync('./' + foto)) {
                        const buffer = fs.readFileSync('./' + foto);
                        await sock.sendMessage(chatJid, { image: buffer });
                        enviadas++;
                    }
                }
                if (enviadas === 0) {
                    return reply('⚠️ Error: No se encontraron las imágenes en el servidor.');
                }
            } catch (error) {
                console.error(error);
                return reply('⚠️ Error al enviar las plantillas.');
            }
        }

        if (!isUserAdmin) return; 

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

• .aqui
• .confirmo
• .presente

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
            const partes = texto.split(/[\s.]+/);
            const idBuscar = partes.find(p => p.startsWith('t'));
            
            if (!idBuscar) return reply('⚠️ Usa el formato: Atendido . T1800');
            
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
