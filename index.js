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

// Listas iniciales de administradores y soportes
let admins = [
    '7205553249', '5217205553249@s.whatsapp.net'
];
let soportes = [
    '4623421390', '970905290'
];

let warnings = {}; // { userJid: count }

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
        const senderDigits = cleanSender.replace(/\D/g, '');
        
        let rawText = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
        const texto = rawText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s@]/g, "").trim();

        revisarDia();

        const reply = async (text, options = {}) => {
            await sock.sendMessage(chatJid, { text, ...options }, { quoted: m });
        };

        // Comandos de auto-asignación rápida
        if (texto === 'soyadmin') {
            if (!admins.includes(cleanSender)) {
                admins.push(cleanSender);
                admins.push(senderDigits);
            }
            return reply('👑 ¡Listo! Te has registrado como Administrador General.');
        }

        if (texto === 'soysoporte') {
            if (!soportes.includes(cleanSender)) {
                soportes.push(cleanSender);
                soportes.push(senderDigits);
            }
            return reply('🛡️ ¡Listo! Te has registrado como miembro de Soporte.');
        }

        const isUserAdmin = admins.some(a => cleanSender.includes(a) || senderDigits.includes(a));
        const isUserSupport = isUserAdmin || soportes.some(s => cleanSender.includes(s) || senderDigits.includes(s));

        // Control de permisos estrictos
        const isAdminOnlyCommand = texto.startsWith('addadmin') || 
                                   texto.startsWith('addamin') || 
                                   texto.startsWith('deladmin') || 
                                   texto.startsWith('addsoporte') || 
                                   texto.startsWith('delsoporte') || 
                                   texto === 'listaadmins' || 
                                   texto === 'kick' || 
                                   texto === 'del' || 
                                   texto === 'warn';

        if (isAdminOnlyCommand && !isUserAdmin) {
            return reply('⚠️ No tienes privilegios de Administrador General.');
        }

        const isSupportCommand = texto === 'siguiente' || 
                                 texto === 'turnos' || 
                                 texto.startsWith('atendido') || 
                                 texto === 'topsoporte';

        if (isSupportCommand && !isUserSupport) {
            return reply('⚠️ No eres miembro de soporte.');
        }

        // ==========================================
        // COMANDOS DE MODERACIÓN (Solo Admins)
        // ==========================================
        if (texto === 'kick') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            if (!contextInfo || !contextInfo.participant) {
                return reply('⚠️ Debes citar el mensaje de la persona que deseas expulsar.');
            }
            const targetParticipant = contextInfo.participant;
            try {
                await sock.groupParticipantsUpdate(chatJid, [targetParticipant], 'remove');
                return reply(`✅ Usuario expulsado exitosamente.`);
            } catch (err) {
                console.error(err);
                return reply('⚠️ Error al expulsar. Asegúrate de que el bot sea administrador del grupo.');
            }
        }

        if (texto === 'del') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            if (!contextInfo || !contextInfo.stanzaId) {
                return reply('⚠️ Debes citar el mensaje que deseas eliminar.');
            }
            try {
                // Eliminar el mensaje seleccionado
                await sock.sendMessage(chatJid, { delete: { remoteJid: chatJid, id: contextInfo.stanzaId, participant: contextInfo.participant } });
                // Eliminar el mensaje del comando 'del'
                await sock.sendMessage(chatJid, { delete: m.key });
            } catch (err) {
                console.error(err);
                return reply('⚠️ Error al eliminar los mensajes.');
            }
            return;
        }

        if (texto === 'warn') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            if (!contextInfo || !contextInfo.participant) {
                return reply('⚠️ Debes citar un mensaje del usuario al que deseas advertir.');
            }
            const target = contextInfo.participant;
            const targetPhone = target.split('@')[0];
            if (!warnings[target]) warnings[target] = 0;
            warnings[target]++;

            if (warnings[target] >= 3) {
                delete warnings[target];
                try {
                    await sock.groupParticipantsUpdate(chatJid, [target], 'remove');
                    return reply(`❌ @${targetPhone} ha acumulado 3 advertencias y ha sido expulsado del grupo.`, { mentions: [target] });
                } catch (err) {
                    return reply(`⚠️ @${targetPhone} alcanzó 3 advertencias, pero no pude expulsarlo (verifica permisos del bot).`, { mentions: [target] });
                }
            } else {
                return reply(`⚠️ Advertencia ${warnings[target]}/3 para @${targetPhone}.`, { mentions: [target] });
            }
        }

        // ==========================================
        // GESTIÓN DE ROLES (Admins & Soporte)
        // ==========================================
        if (texto.startsWith('addadmin') || texto.startsWith('addamin')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                if (!admins.includes(target)) {
                    admins.push(target);
                    return reply(`✅ @${target.split('@')[0]} ahora es Administrador General.`);
                } else {
                    return reply(`⚠️ Esa persona ya es administrador.`);
                }
            } else {
                return reply(`⚠️ Debes etiquetar a la persona (ej: addadmin @usuario).`);
            }
        }

        if (texto.startsWith('deladmin')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                admins = admins.filter(a => a !== target);
                return reply(`✅ Removido de administradores generales.`);
            } else {
                return reply(`⚠️ Debes etiquetar al admin a eliminar.`);
            }
        }

        if (texto.startsWith('addsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                if (!soportes.includes(target)) {
                    soportes.push(target);
                    return reply(`✅ @${target.split('@')[0]} ahora es Soporte (sin privilegios de moderación).`);
                } else {
                    return reply(`⚠️ Esa persona ya es soporte.`);
                }
            } else {
                return reply(`⚠️ Debes etiquetar a la persona (ej: addsoporte @usuario).`);
            }
        }

        if (texto.startsWith('delsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                soportes = soportes.filter(s => s !== target);
                return reply(`✅ Removido de soporte.`);
            } else {
                return reply(`⚠️ Debes etiquetar al soporte a eliminar.`);
            }
        }

        if (texto === 'listaadmins') {
            return reply(`👑 *Administradores:* \n${admins.map(a => '• @' + a.split('@')[0]).join('\n')}\n\n🛡️ *Soportes:* \n${soportes.map(s => '• @' + s.split('@')[0]).join('\n')}`, {
                mentions: [...admins, ...soportes]
            });
        }

        // ==========================================
        // TOP SOPORTE
        // ==========================================
        if (texto === 'topsoporte') {
            if (Object.keys(statsAdmins).length === 0) {
                return reply('📊 Aún no hay turnos atendidos registrados.');
            }
            let topText = '🏆 *TOP SOPORTE (Turnos Atendidos)*\n\n';
            const sorted = Object.entries(statsAdmins).sort((a, b) => b[1] - a[1]);
            sorted.forEach(([jid, count], index) => {
                const phone = jid.split('@')[0];
                topText += `${index + 1}. @${phone} - ${count} turnos\n`;
            });
            return sock.sendMessage(chatJid, { text: topText, mentions: sorted.map(s => s[0]) });
        }

        // ==========================================
        // PLANTILLAS PERSONALES
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
                    return reply('⚠️ Error al guardar la imagen.');
                }
            } else {
                return reply('⚠️ Debes enviar una imagen adjunta escribiendo *adplantilla*.');
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
                return reply('⚠️ No tienes ninguna plantilla guardada.');
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
                const assignedAdmin = turnosActivos[cleanSender].admin;
                delete turnosActivos[cleanSender]; 
                
                registroDiario[cleanSender] += 1; 
                const adminPhone = assignedAdmin ? assignedAdmin.split('@')[0] : '';
                return reply(`✅ Confirmado (Turno ${turnoId}). Llevas ${registroDiario[cleanSender]}/2 ayudas hoy, ponte en contacto con cái soporte asignado @${adminPhone}`, {
                    mentions: assignedAdmin ? [assignedAdmin] : []
                });
            } else {
                const enCola = cola.some(t => t.sender === cleanSender);
                if (enCola) {
                    return reply('⏳ Todavía no has sido llamado. Espera a que el soporte te llame.');
                } else {
                    return reply('⚠️ No tienes ningún turno activo ni estás en la fila.');
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
                    return reply('⚠️ Error: No se encontraron las imágenes fijas.');
                }
            } catch (error) {
                console.error(error);
                return reply('⚠️ Error al enviar las plantillas.');
            }
        }

        // ==========================================
        // COMANDOS DE SOPORTE (Soporte o Admins)
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
                admin: cleanSender,
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
