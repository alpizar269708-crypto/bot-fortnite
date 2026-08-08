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

// Listas iniciales de administradores, soportes y baneados del bot
let admins = [
    '7205553249', '5217205553249@s.whatsapp.net'
];
let soportes = [
    '4623421390', '970905290'
];
let bannedUsers = []; 

let warnings = {}; 
let lastAttended = {}; 
let lastMiturnoTime = {}; 

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

    // ==========================================
    // EVENTO DE BIENVENIDA PARA NUEVOS MIEMBROS
    // ==========================================
    sock.ev.on('group-participants-update', async (update) => {
        const { id: chatJid, participants, action } = update;
        if (action === 'add') {
            for (const user of participants) {
                const userPhone = user.split('@')[0];
                const caption = `✧༺✦𝑩𝒊𝒆𝒏𝒗𝒆𝒏𝒊𝒅@✦༻✧
 
💌 Hola @${userPhone}
 
╭─────────────
👻 COMUNIDAD DE
INTERCAMBIO DE ESPÍRITUS FORTNITE 👻
 
Grupo creado para apoyar a los jugadores en la recolección
de espíritus mediante intercambios, cooperación y apoyo mutuo.
 
📜* NORMAS*
 
✅ Indica claramente qué espíritus
tienes y cuáles necesitas.
✅ Mantén respeto y buena
convivencia en todo momento, evitando la toxicidad y responder de mala forma a
quien no lo está haciendo contigo.
✅ Los intercambios deben hacerse
de forma ordenada y responsable.
🤝 Se fomenta ayudar a
otros miembros cuando sea posible.
 
🚫 PROHIBIDO
 
❌ Entrar solo a pedir sin aportar
a la comunidad. Incluso con excusas como "Primero completo mi colección y
luego les presto". 
❌ Actitudes de burla, arrogancia
o conflicto.
❌ Falsas ofertas de espíritus o
negarse a comprobar lo publicado.
❌ Spam o mensajes fuera del tema
(usa el grupo correspondiente para charlas).
❌️ Pedir intercambios por objetos
cosméticos o económicos para ayudarles (incluso si dices que es opcional, a
menos que la persona te lo de por agradecimiento sin que tú hayas mencionado o
insinuado algo al respecto).
 
⚠️ Quienes generen conflictos o
no colaboren podrán ser removidos, también aquellos que envíen contenido
altamente explícito o +18.
  
🎮 Comunidad basada en
respeto, apoyo y progreso conjunto.
 
Utiliza el comando "help" para desplegar el menú
del bot, el menú es este:

* turno *- Solicita un turno en la fila.
* cancelarturno *- Cancela tu turno actual (cuenta como ayuda utilizada del día).
* aqui / confirmo / presente *- Confirma tu turno al ser llamado.
* plantilla *- Envía las imágenes fijas.
* adplantilla *- Guarda tu plantilla personalizada (adjuntando foto).
* miplantilla *- Muestra tu plantilla guardada.
* help *- Muestra esta lista de comandos.`;

                try {
                    await sock.sendMessage(chatJid, { 
                        image: { url: 'https://raw.githubusercontent.com/alpizar269708-crypto/bot-fortnite/e4b4a1ea9247840979d7567cbb5566d12c1a95fd/bienvenido.jpeg' }, 
                        caption: caption,
                        mentions: [user]
                    });
                } catch (err) {
                    console.error('Error al enviar la imagen de bienvenida, enviando solo texto:', err);
                    await sock.sendMessage(chatJid, { 
                        text: caption,
                        mentions: [user]
                    });
                }
            }
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const chatJid = m.key.remoteJid;
        const sender = m.key.participant || chatJid;
        const cleanSender = sender.replace(/:\d+@/, '@');
        const senderDigits = cleanSender.replace(/\D/g, '');

        if (bannedUsers.includes(cleanSender) || bannedUsers.some(b => senderDigits.includes(b))) {
            return;
        }
        
        let rawText = m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || '';
        const texto = rawText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s@\.]/g, "").trim();

        revisarDia();

        const reply = async (text, options = {}) => {
            await sock.sendMessage(chatJid, { text, ...options }, { quoted: m });
        };

        // Comandos de auto-asignación rápida (FUNCIONALES PERO OCULTOS EN HELP)
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

        // ==========================================
        // COMANDO HELP (OCULTAMOS SOYADMIN/SOYSOPORTE AQUÍ)
        // ==========================================
        if (texto === 'help') {
            let helpText = '🤖 *LISTA DE COMANDOS DISPONIBLES*\n\n';
            
            helpText += '👥 *Comandos Públicos:*\n';
            helpText += '• *turno* - Solicita un turno en la fila.\n';
            helpText += '• *miturno* - Consulta tu estado en la fila (uso cada 30 min).\n';
            helpText += '• *cancelarturno* - Cancela tu turno actual.\n';
            helpText += '• *aqui / confirmo / presente* - Confirma tu turno al ser llamado.\n';
            helpText += '• *plantilla* - Envía las imágenes fijas.\n';
            helpText += '• *adplantilla* - Guarda tu plantilla personalizada (adjuntando foto).\n';
            helpText += '• *miplantilla* - Muestra tu plantilla guardada.\n';
            helpText += '• *help* - Muestra esta lista de comandos.\n\n';

            if (isUserSupport || isUserAdmin) {
                helpText += '🛡️ *Comandos de Soporte:*\n';
                helpText += '• *siguiente* - Llama al siguiente usuario de la fila.\n';
                helpText += '• *turnos* - Muestra la lista de turnos pendientes.\n';
                helpText += '• *atendido TXXXX* - Marca un turno específico como atendido.\n';
                helpText += '• *topsoporte* - Muestra el ranking de turnos atendidos y última vez.\n\n';
            }

            if (isUserAdmin) {
                helpText += '👑 *Comandos de Administrador General:*\n';
                helpText += '• *cerrargrupo* - Cierra el grupo para que solo los admins escriban.\n';
                helpText += '• *abrirgrupo* - Abre el grupo para que todos puedan escribir.\n';
                helpText += '• *.notify [mensaje]* - Etiqueta a todos los miembros del grupo.\n';
                helpText += '• *kick* - Expulsa al usuario del mensaje citado.\n';
                helpText += '• *del* - Elimina para todos el mensaje citado.\n';
                helpText += '• *warn* - Da una advertencia (3 warn = expulsión automática).\n';
                helpText += '• *cleanwarns* - Limpia las advertencias de un usuario.\n';
                helpText += '• *demote* - Quita privilegios de admin del grupo y del bot.\n';
                helpText += '• *banbot* - Quita los derechos de usar comandos del bot a un usuario.\n';
                helpText += '• *unbanbot* - Restaura los derechos de usar el bot a un usuario.\n';
                helpText += '• *addadmin @usuario* - Agrega un Administrador General.\n';
                helpText += '• *deladmin @usuario* - Elimina un Administrador General.\n';
                helpText += '• *addsoporte @usuario* - Agrega un miembro de soporte.\n';
                helpText += '• *delsoporte @usuario* - Elimina un miembro de soporte.\n';
                helpText += '• *listaadmins* - Muestra la lista de administradores y soportes.\n';
            }

            return reply(helpText);
        }

        const isAdminOnlyCommand = texto.startsWith('addadmin') || 
                                   texto.startsWith('addamin') || 
                                   texto.startsWith('deladmin') || 
                                   texto.startsWith('addsoporte') || 
                                   texto.startsWith('delsoporte') || 
                                   texto === 'listaadmins' || 
                                   texto === 'kick' || 
                                   texto === 'del' || 
                                   texto === 'warn' ||
                                   texto.startsWith('cleanwarns') ||
                                   texto === 'demote' ||
                                   texto === 'banbot' ||
                                   texto === 'unbanbot' ||
                                   texto === 'cerrargrupo' ||
                                   texto === 'abrirgrupo' ||
                                   texto.startsWith('notify');

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
        // COMANDOS DE MODERACIÓN Y GRUPO (Solo Admins)
        // ==========================================
        if (texto === 'cerrargrupo') {
            try {
                await sock.groupSettingUpdate(chatJid, 'announcement');
                return reply('🔒 Grupo cerrado. Ahora solo los administradores pueden enviar mensajes.');
            } catch (err) {
                console.error(err);
                return reply('⚠️ Error al cerrar el grupo. Asegúrate de que el bot sea administrador.');
            }
        }

        if (texto === 'abrirgrupo') {
            try {
                await sock.groupSettingUpdate(chatJid, 'not_announcement');
                return reply('🔓 Grupo abierto. Todos los miembros pueden enviar mensajes.');
            } catch (err) {
                console.error(err);
                return reply('⚠️ Error al abrir el grupo. Asegúrate de que el bot sea administrador.');
            }
        }

        if (texto === 'notify' || texto.startsWith('notify ')) {
            try {
                const metadata = await sock.groupMetadata(chatJid);
                const participants = metadata.participants.map(p => p.id);
                const customMsg = rawText.replace(/^\.?notify/i, '').trim();
                const notificationText = `📢 *AVISO GENERAL*\n\n${customMsg || '¡Atención a todos los miembros!'}`;
                await sock.sendMessage(chatJid, { text: notificationText, mentions: participants }, { quoted: m });
            } catch (err) {
                console.error(err);
                return reply('⚠️ Error al notificar a los miembros.');
            }
            return;
        }

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
                return reply('⚠️ Error al expulsar.');
            }
        }

        if (texto === 'demote') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            let target = null;
            if (contextInfo && contextInfo.participant) {
                target = contextInfo.participant;
            } else {
                const mentioned = contextInfo?.mentionedJid;
                if (mentioned && mentioned.length > 0) {
                    target = mentioned[0];
                }
            }
            if (!target) {
                return reply('⚠️ Debes citar un mensaje o etiquetar a la persona que deseas degradar.');
            }
            try {
                await sock.groupParticipantsUpdate(chatJid, [target], 'demote');
                admins = admins.filter(a => !target.includes(a) && !a.includes(target.replace(/\D/g, '')));
                soportes = soportes.filter(s => !target.includes(s) && !s.includes(target.replace(/\D/g, '')));
                return reply(`✅ @${target.split('@')[0]} ha sido degradado.`, { mentions: [target] });
            } catch (err) {
                console.error(err);
                return reply('⚠️ Error al degradar al usuario.');
            }
        }

        if (texto === 'banbot') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            let target = null;
            if (contextInfo && contextInfo.participant) {
                target = contextInfo.participant;
            } else {
                const mentioned = contextInfo?.mentionedJid;
                if (mentioned && mentioned.length > 0) {
                    target = mentioned[0];
                }
            }
            if (!target) {
                return reply('⚠️ Debes citar un mensaje o etiquetar a la persona a banear del bot.');
            }
            if (!bannedUsers.includes(target)) {
                bannedUsers.push(target);
                const targetDigits = target.replace(/\D/g, '');
                if (!bannedUsers.includes(targetDigits)) bannedUsers.push(targetDigits);
            }
            admins = admins.filter(a => !target.includes(a) && !a.includes(target.replace(/\D/g, '')));
            soportes = soportes.filter(s => !target.includes(s) && !s.includes(target.replace(/\D/g, '')));
            return reply(`🚫 @${target.split('@')[0]} ha sido baneado del bot.`, { mentions: [target] });
        }

        if (texto === 'unbanbot') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            let target = null;
            if (contextInfo && contextInfo.participant) {
                target = contextInfo.participant;
            } else {
                const mentioned = contextInfo?.mentionedJid;
                if (mentioned && mentioned.length > 0) {
                    target = mentioned[0];
                }
            }
            if (!target) {
                return reply('⚠️ Debes citar un mensaje o etiquetar a la persona a desbanear.');
            }
            const targetDigits = target.replace(/\D/g, '');
            bannedUsers = bannedUsers.filter(b => b !== target && !target.includes(b) && b !== targetDigits);
            return reply(`✅ @${target.split('@')[0]} ha sido desbaneado del bot.`, { mentions: [target] });
        }

        if (texto === 'del') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            if (!contextInfo || !contextInfo.stanzaId) {
                return reply('⚠️ Debes citar el mensaje que deseas eliminar.');
            }
            try {
                await sock.sendMessage(chatJid, { delete: { remoteJid: chatJid, id: contextInfo.stanzaId, participant: contextInfo.participant } });
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
                    return reply(`❌ @${targetPhone} acumuló 3 advertencias y fue expulsado.`, { mentions: [target] });
                } catch (err) {
                    return reply(`⚠️ @${targetPhone} alcanzó 3 advertencias, pero no pude expulsarlo.`, { mentions: [target] });
                }
            } else {
                return reply(`⚠️ Advertencia ${warnings[target]}/3 para @${targetPhone}.`, { mentions: [target] });
            }
        }

        if (texto.startsWith('cleanwarns')) {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            let target = null;
            if (contextInfo && contextInfo.participant) {
                target = contextInfo.participant;
            } else {
                const mentioned = contextInfo?.mentionedJid;
                if (mentioned && mentioned.length > 0) {
                    target = mentioned[0];
                }
            }
            if (!target) {
                return reply('⚠️ Debes citar un mensaje o etiquetar a la persona.');
            }
            const targetPhone = target.split('@')[0];
            if (warnings[target]) {
                delete warnings[target];
                return reply(`✅ Se limpiaron las advertencias de @${targetPhone}.`, { mentions: [target] });
            } else {
                return reply(`ℹ️ El usuario @${targetPhone} no tiene advertencias.`, { mentions: [target] });
            }
        }

        // ==========================================
        // GESTIÓN DE ROLES
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
                return reply(`⚠️ Debes etiquetar a la persona.`);
            }
        }

        if (texto.startsWith('deladmin')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                admins = admins.filter(a => a !== target);
                return reply(`✅ Removido de administradores.`);
            } else {
                return reply(`⚠️ Debes etiquetar al admin.`);
            }
        }

        if (texto.startsWith('addsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                if (!soportes.includes(target)) {
                    soportes.push(target);
                    return reply(`✅ @${target.split('@')[0]} ahora es Soporte.`);
                } else {
                    return reply(`⚠️ Esa persona ya es soporte.`);
                }
            } else {
                return reply(`⚠️ Debes etiquetar a la persona.`);
            }
        }

        if (texto.startsWith('delsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                soportes = soportes.filter(s => s !== target);
                return reply(`✅ Removido de soporte.`);
            } else {
                return reply(`⚠️ Debes etiquetar al soporte.`);
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
                return reply('📊 Aún no hay turnos atendidos.');
            }
            let topText = '🏆 *TOP SOPORTE (Turnos Atendidos)*\n\n';
            const sorted = Object.entries(statsAdmins).sort((a, b) => b[1] - a[1]);
            sorted.forEach(([jid, count], index) => {
                const phone = jid.split('@')[0];
                const lastTime = lastAttended[jid] ? new Date(lastAttended[jid]).toLocaleString() : 'N/A';
                topText += `${index + 1}. @${phone}\n   • Turnos: ${count}\n   • Última vez: ${lastTime}\n\n`;
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
                    return reply('✅ ¡Plantilla guardada!');
                } catch (err) {
                    console.error(err);
                    return reply('⚠️ Error al guardar la imagen.');
                }
            } else {
                return reply('⚠️ Envía una imagen con el texto *adplantilla*.');
            }
        }

        if (texto === 'miplantilla') {
            const userPhone = senderDigits.slice(-10);
            const filePath = path.join(__dirname, 'plantillas', `${userPhone}.jpg`);
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                await sock.sendMessage(chatJid, { image: buffer, caption: '📌 Tu plantilla:' }, { quoted: m });
                return;
            } else {
                return reply('⚠️ No tienes plantilla guardada.');
            }
        }

        // ==========================================
        // COMANDOS PÚBLICOS
        // ==========================================
        if (texto === 'turno') {
            if (!registroDiario[cleanSender]) registroDiario[cleanSender] = 0;
            
            if (registroDiario[cleanSender] >= 2) {
                return reply('❌ Ya agotaste tus 2 ayudas del día.');
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
            
            return reply(`✅ *Turno generado: ${idTurno}*\nEspera tu llamado en el grupo.\n\n📊 *Ayudas hoy:* ${registroDiario[cleanSender]}/2`);
        }

        if (texto === 'miturno') {
            const ahora = Date.now();
            const cooldown = 30 * 60 * 1000; 
            if (lastMiturnoTime[cleanSender] && (ahora - lastMiturnoTime[cleanSender] < cooldown)) {
                const minutosRestantes = Math.ceil((cooldown - (ahora - lastMiturnoTime[cleanSender])) / 60000);
                return reply(`⏳ Debes esperar ${minutosRestantes} minuto(s) más para volver a usar el comando *miturno*.`);
            }
            lastMiturnoTime[cleanSender] = ahora;

            if (turnosActivos[cleanSender]) {
                const turnoActivo = turnosActivos[cleanSender];
                return reply(`🔔 ¡Tu turno *${turnoActivo.id}* está actualmente *EN ATENCIÓN*! Revisa el llamado del soporte.`);
            }

            const indexCola = cola.findIndex(t => t.sender === cleanSender);
            if (indexCola !== -1) {
                const miTurnoObj = cola[indexCola];
                const personasDelante = indexCola; 
                return reply(`🎫 Tu turno es el *${miTurnoObj.id}*.\n📍 Posición en la fila: #${indexCola + 1}\n👥 Personas que te hacen falta: *${personasDelante}*.`);
            } else {
                return reply('⚠️ No tienes ningún turno activo ni te encuentras en la fila de espera.');
            }
        }

        if (texto === 'cancelarturno') {
            if (!registroDiario[cleanSender]) registroDiario[cleanSender] = 0;
            
            let cancelado = false;
            
            const indexCola = cola.findIndex(t => t.sender === cleanSender);
            if (indexCola !== -1) {
                cola.splice(indexCola, 1);
                cancelado = true;
            }

            if (turnosActivos[cleanSender]) {
                clearTimeout(turnosActivos[cleanSender].timer);
                delete turnosActivos[cleanSender];
                cancelado = true;
            }

            if (cancelado) {
                registroDiario[cleanSender] += 1;
                return reply(`❌ Turno cancelado.\n\nℹ️ Cuenta como ayuda utilizada (${registroDiario[cleanSender]}/2).`);
            } else {
                return reply('⚠️ No tienes turnos activos ni estás en fila.');
            }
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
                return reply(`✅ Confirmado (Turno ${turnoId}). Llevas ${registroDiario[cleanSender]}/2 ayudas hoy, envíale mensaje privado al soporte asignado @${adminPhone}, solo dispones de 3 minutos para que no se marque como atendido tu turno`, {
                    mentions: assignedAdmin ? [assignedAdmin] : []
                });
            } else {
                const enCola = cola.some(t => t.sender === cleanSender);
                if (enCola) {
                    return reply('⏳ Aún no has sido llamado.');
                } else {
                    return reply('⚠️ No tienes turnos activos.');
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
                    return reply('⚠️ No se encontraron las imágenes.');
                }
            } catch (error) {
                console.error(error);
                return reply('⚠️ Error al enviar las plantillas.');
            }
        }

        // ==========================================
        // COMANDOS DE SOPORTE
        // ==========================================
        if (texto === 'siguiente') {
            if (cola.length === 0) return reply('📭 Fila vacía.');

            const turnoActual = cola.shift(); 
            
            if (!statsAdmins[cleanSender]) statsAdmins[cleanSender] = 0;
            statsAdmins[cleanSender]++;
            lastAttended[cleanSender] = Date.now(); 
            
            const userPhone = turnoActual.sender.split('@')[0];
            const adminPhone = cleanSender.split('@')[0];

            const msgLlamado = `📢 *TURNO EN ATENCIÓN*

🎫 Turno: *${turnoActual.id}*
👤 Usuario: @${userPhone}
🛡️ Soporte: @${adminPhone}

✅ Para confirmar responde:
aqui
confirmo
presente

⏳ Tienes *3 minutos* para responder, sino respondes tu turno se finalizara en automatico y tendras que solicitar uno nuevo.`;

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
            if (cola.length === 0) return reply('📭 Fila vacía.');
            
            let lista = `📋 *LISTA DE TURNOS* (${cola.length})\n\n`;
            const ahora = Date.now();

            cola.forEach((t) => {
                const minEspera = Math.floor((ahora - t.tiempoRegistro) / 60000); 
                lista += `🎫 ${t.id} - @${t.sender.split('@')[0]} (${minEspera} min)\n`;
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
                lastAttended[cleanSender] = Date.now(); 

                return reply(`✅ Turno ${idMayus} marcado como atendido.`);
            } else {
                return reply(`⚠️ No se encontró el turno ${idMayus}.`);
            }
        }
    });
}

startBot();
