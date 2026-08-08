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

// Listas iniciales de administradores, soportes y baneados del bot (en formato JID seguro)
let admins = [
    '7205553249@s.whatsapp.net', '5217205553249@s.whatsapp.net'
];
let soportes = [
    '4623421390@s.whatsapp.net', '970905290@s.whatsapp.net'
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
    // EVENTO DE BIENVENIDA (VISUALMENTE CÓMODO)
    // ==========================================
    sock.ev.on('group-participants-update', async (update) => {
        const { id: chatJid, participants, action } = update;
        if (action === 'add') {
            for (const user of participants) {
                const userPhone = user.split('@')[0];
                const caption = `✧༺✦ **𝑩𝒊𝒆𝒏𝒗𝒆𝒏𝒊𝒅@** ✦༻✧
 
💌 ¡Hola @${userPhone}! Te damos la más cordial bienvenida a la comunidad. ✨
 
╭────────────────────────╮
  👻 **COMUNIDAD DE INTERCAMBIO** 👻
  🔮 **DE ESPÍRITUS FORTNITE** 🔮
╰────────────────────────╯
 
📌 Grupo creado para apoyar a los jugadores en la recolección de espíritus mediante intercambios, cooperación y apoyo mutuo. 🤝
 
 
📜 **NORMATIVA DEL GRUPO** 📜
 
✅ Indica claramente qué espíritus tienes y cuáles necesitas. 📋
✅ Mantén el respeto y la buena convivencia, evitando la toxicidad o malos tratos. 💬💖
✅ Realiza tus intercambios de forma ordenada y responsable. ⚖️
🤝 Fomentamos la ayuda mutua entre todos los miembros. 🌟
 
 
🚫 **LO QUE ESTÁ PROHIBIDO** 🚫
 
❌ Entrar únicamente a pedir sin aportar a la comunidad (ej. *"Primero completo mi colección y luego presto"*). ⛔
❌ Actitudes de burla, arrogancia, prepotencia o generar conflictos. 🛑
❌ Falsas ofertas de espíritus o negarse a comprobar lo publicado. 🔍❌
❌ Spam o mensajes fuera del tema (utiliza el grupo correspondiente para charlas). 📵
❌ Pedir intercambios por objetos cosméticos, de pago o económicos a cambio de ayuda. 💸❌
 
 
⚠️ *Nota:* Quienes generen conflictos, no colaboren o envíen contenido explícito/+18 serán removidos inmediatamente del grupo. 🚫🔨
 
 
🎮 **¡Esperamos que disfrutes tu estancia y logres completar tus objetivos!** 🚀🔥
 
---
 
🤖 *Usa el comando* \`help\` *para ver el menú de comandos disponibles:*
 
• \`turno\` ➔ Solicita un turno en la fila.
• \`miturno\` ➔ Consulta tu estado actual.
• \`cancelarturno\` ➔ Cancela tu turno.
• \`helpadmin\` ➔ Llama a los administradores.
• \`helpsoporte\` ➔ Llama al soporte técnico.
• \`aqui / confirmo\` ➔ Confirma tu llamado.
• \`plantilla\` ➔ Envía las imágenes fijas.
• \`miplantilla\` ➔ Muestra tu plantilla personal.`;

                try {
                    await sock.sendMessage(chatJid, { 
                        image: { url: 'https://raw.githubusercontent.com/alpizar269708-crypto/bot-fortnite/refs/heads/main/bienvenido.jpeg' }, 
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

        // Comandos ocultos de auto-asignación
        if (texto === 'soyadmin') {
            if (!admins.includes(cleanSender)) {
                admins.push(cleanSender);
            }
            return reply('👑 *¡Listo!*\n\nTe has registrado exitosamente como Administrador General.');
        }

        if (texto === 'soysoporte') {
            if (!soportes.includes(cleanSender)) {
                soportes.push(cleanSender);
            }
            return reply('🛡️ *¡Listo!*\n\nTe has registrado exitosamente como miembro de Soporte.');
        }

        const isUserAdmin = admins.some(a => cleanSender.includes(a.split('@')[0]) || senderDigits.includes(a.split('@')[0]));
        const isUserSupport = isUserAdmin || soportes.some(s => cleanSender.includes(s.split('@')[0]) || senderDigits.includes(s.split('@')[0]));

        // ==========================================
        // COMANDO HELP (ESTRUCTURADO Y CÓMODO)
        // ==========================================
        if (texto === 'help') {
            let helpText = '🤖 *MENÚ DE COMANDOS DISPONIBLES* 🤖\n\n';
            
            helpText += '👥 *COMANDOS PÚBLICOS*\n';
            helpText += '────────────────────────\n';
            helpText += '• *turno* ➔ Solicita un turno en la fila.\n';
            helpText += '• *miturno* ➔ Consulta tu estado en la fila (cada 30 min).\n';
            helpText += '• *cancelarturno* ➔ Cancela tu turno actual.\n';
            helpText += '• *helpadmin* ➔ Llama o etiqueta a los administradores.\n';
            helpText += '• *helpsoporte* ➔ Llama o etiqueta al equipo de soporte.\n';
            helpText += '• *aqui / confirmo / presente* ➔ Confirma tu turno al ser llamado.\n';
            helpText += '• *plantilla* ➔ Envía las imágenes fijas.\n';
            helpText += '• *adplantilla* ➔ Guarda tu plantilla personalizada (adjuntando foto).\n';
            helpText += '• *miplantilla* ➔ Muestra tu plantilla guardada.\n';
            helpText += '• *help* ➔ Muestra este menú de ayuda.\n\n';

            if (isUserSupport || isUserAdmin) {
                helpText += '🛡️ *COMANDOS DE SOPORTE*\n';
                helpText += '────────────────────────\n';
                helpText += '• *siguiente* ➔ Llama al siguiente usuario de la fila.\n';
                helpText += '• *turnos* ➔ Muestra la lista de turnos pendientes.\n';
                helpText += '• *atendido TXXXXX* ➔ Marca un turno específico como atendido.\n';
                helpText += '• *topsoporte* ➔ Muestra el ranking de turnos atendidos (GMT-6).\n\n';
            }

            if (isUserAdmin) {
                helpText += '👑 *COMANDOS DE ADMINISTRADOR*\n';
                helpText += '────────────────────────\n';
                helpText += '• *cerrargrupo* ➔ Cierra el grupo para que solo los admins escriban.\n';
                helpText += '• *abrirgrupo* ➔ Abre el grupo para todos los miembros.\n';
                helpText += '• *.notify [mensaje]* ➔ Etiqueta a todos los miembros del grupo.\n';
                helpText += '• *kick* ➔ Expulsa al usuario del mensaje citado.\n';
                helpText += '• *del* ➔ Elimina para todos el mensaje citado.\n';
                helpText += '• *warn* ➔ Da una advertencia (3 warn = expulsión automática).\n';
                helpText += '• *cleanwarns* ➔ Limpia las advertencias de un usuario.\n';
                helpText += '• *demote* ➔ Quita privilegios de admin del grupo y del bot.\n';
                helpText += '• *banbot* ➔ Quita los derechos de usar comandos del bot a un usuario.\n';
                helpText += '• *unbanbot* ➔ Restaura los derechos de usar el bot.\n';
                helpText += '• *addadmin @usuario* ➔ Agrega un Administrador General.\n';
                helpText += '• *deladmin @usuario* ➔ Elimina un Administrador General.\n';
                helpText += '• *addsoporte @usuario* ➔ Agrega un miembro de soporte.\n';
                helpText += '• *delsoporte @usuario* ➔ Elimina un miembro de soporte.\n';
                helpText += '• *listaadmins* ➔ Muestra la lista de admins y soportes activos.\n';
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
            return reply('⚠️ *Acceso Denegado*\n\nNo cuentas con los privilegios de Administrador General necesarios para ejecutar este comando.');
        }

        const isSupportCommand = texto === 'siguiente' || 
                                 texto === 'turnos' || 
                                 texto.startsWith('atendido') || 
                                 texto === 'topsoporte';

        if (isSupportCommand && !isUserSupport) {
            return reply('⚠️ *Acceso Denegado*\n\nNo estás registrado como miembro de soporte.');
        }

        // ==========================================
        // COMANDOS DE AYUDA RÁPIDA (HELPADMIN / HELPSOPORTE)
        // ==========================================
        if (texto === 'helpadmin') {
            if (admins.length === 0) return reply('⚠️ *Aviso*\n\nNo hay administradores generales registrados en este momento.');
            const safeAdmins = admins.map(a => a.includes('@') ? a : `${a}@s.whatsapp.net`);
            let msgAdmin = '👑 *ATENCIÓN ADMINISTRADORES* 👑\n\n────────────────────────\n';
            msgAdmin += 'Se solicita la presencia de un administrador para revisar una situación o duda.\n\n';
            msgAdmin += safeAdmins.map(a => `• @${a.split('@')[0]}`).join('\n');
            msgAdmin += '\n────────────────────────';
            return sock.sendMessage(chatJid, { text: msgAdmin, mentions: safeAdmins }, { quoted: m });
        }

        if (texto === 'helpsoporte') {
            if (soportes.length === 0) return reply('⚠️ *Aviso*\n\nNo hay miembros de soporte registrados en este momento.');
            const safeSoportes = soportes.map(s => s.includes('@') ? s : `${s}@s.whatsapp.net`);
            let msgSoporte = '🛡️ *ATENCIÓN SOPORTE TÉCNICO* 🛡️\n\n────────────────────────\n';
            msgSoporte += 'Se solicita la asistencia del equipo de soporte.\n\n';
            msgSoporte += safeSoportes.map(s => `• @${s.split('@')[0]}`).join('\n');
            msgSoporte += '\n────────────────────────';
            return sock.sendMessage(chatJid, { text: msgSoporte, mentions: safeSoportes }, { quoted: m });
        }

        // ==========================================
        // COMANDOS DE MODERACIÓN Y GRUPO (Solo Admins)
        // ==========================================
        if (texto === 'cerrargrupo') {
            try {
                await sock.groupSettingUpdate(chatJid, 'announcement');
                return reply('🔒 *GRUPO CERRADO*\n\nA partir de ahora, solo los administradores pueden enviar mensajes en este chat.');
            } catch (err) {
                console.error(err);
                return reply('⚠️ *Error*\n\nNo se pudo cerrar el grupo. Asegúrate de que el bot tenga permisos de administrador.');
            }
        }

        if (texto === 'abrirgrupo') {
            try {
                await sock.groupSettingUpdate(chatJid, 'not_announcement');
                return reply('🔓 *GRUPO ABIERTO*\n\nEl grupo ha sido abierto. Todos los miembros pueden enviar mensajes nuevamente.');
            } catch (err) {
                console.error(err);
                return reply('⚠️ *Error*\n\nNo se pudo abrir el grupo. Asegúrate de que el bot tenga permisos de administrador.');
            }
        }

        if (texto === 'notify' || texto.startsWith('notify ')) {
            try {
                const metadata = await sock.groupMetadata(chatJid);
                const participants = metadata.participants.map(p => p.id);
                const customMsg = rawText.replace(/^\.?notify/i, '').trim();
                const notificationText = `📢 *AVISO GENERAL*\n\n${customMsg || '¡Atención a todos los miembros del grupo!'}`;
                await sock.sendMessage(chatJid, { text: notificationText, mentions: participants }, { quoted: m });
            } catch (err) {
                console.error(err);
                return reply('⚠️ *Error*\n\nNo se pudo enviar la notificación general.');
            }
            return;
        }

        if (texto === 'kick') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            if (!contextInfo || !contextInfo.participant) {
                return reply('⚠️ *Acción Requerida*\n\nDebes citar (responder) el mensaje de la persona que deseas expulsar.');
            }
            const targetParticipant = contextInfo.participant;
            try {
                await sock.groupParticipantsUpdate(chatJid, [targetParticipant], 'remove');
                return reply(`✅ *Usuario Expulsado*\n\nEl miembro ha sido retirado del grupo exitosamente.`);
            } catch (err) {
                console.error(err);
                return reply('⚠️ *Error*\n\nNo se pudo expulsar al usuario. Verifica que el bot sea administrador del grupo.');
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
                return reply('⚠️ *Acción Requerida*\n\nDebes citar un mensaje o etiquetar a la persona que deseas degradar.');
            }
            try {
                await sock.groupParticipantsUpdate(chatJid, [target], 'demote');
                admins = admins.filter(a => !target.includes(a.split('@')[0]));
                soportes = soportes.filter(s => !target.includes(s.split('@')[0]));
                return reply(`✅ *Privilegios Retirados*\n\n@${target.split('@')[0]} ha sido degradado a miembro y se le retiraron sus permisos del bot.`, { mentions: [target] });
            } catch (err) {
                console.error(err);
                return reply('⚠️ *Error*\n\nNo se pudo degradar al usuario en el grupo.');
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
                return reply('⚠️ *Acción Requerida*\n\nDebes citar un mensaje o etiquetar a la persona que deseas banear del bot.');
            }
            if (!bannedUsers.includes(target)) {
                bannedUsers.push(target);
            }
            admins = admins.filter(a => !target.includes(a.split('@')[0]));
            soportes = soportes.filter(s => !target.includes(s.split('@')[0]));
            return reply(`🚫 *Usuario Baneado del Bot*\n\n@${target.split('@')[0]} ya no tiene permitido utilizar ningún comando del bot.`, { mentions: [target] });
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
                return reply('⚠️ *Acción Requerida*\n\nDebes citar un mensaje o etiquetar a la persona que deseas desbanear del bot.');
            }
            const targetDigits = target.replace(/\D/g, '');
            bannedUsers = bannedUsers.filter(b => b !== target && !target.includes(b) && b !== targetDigits);
            return reply(`✅ *Usuario Desbaneado*\n\n@${target.split('@')[0]} ha recuperado el acceso para usar el bot.`, { mentions: [target] });
        }

        if (texto === 'del') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            if (!contextInfo || !contextInfo.stanzaId) {
                return reply('⚠️ *Acción Requerida*\n\nDebes citar el mensaje que deseas eliminar para todos.');
            }
            try {
                await sock.sendMessage(chatJid, { delete: { remoteJid: chatJid, id: contextInfo.stanzaId, participant: contextInfo.participant } });
                await sock.sendMessage(chatJid, { delete: m.key });
            } catch (err) {
                console.error(err);
                return reply('⚠️ *Error*\n\nNo se pudo eliminar el mensaje seleccionado.');
            }
            return;
        }

        if (texto === 'warn') {
            const contextInfo = m.message.extendedTextMessage?.contextInfo;
            if (!contextInfo || !contextInfo.participant) {
                return reply('⚠️ *Acción Requerida*\n\nDebes citar un mensaje del usuario al que deseas advertir.');
            }
            const target = contextInfo.participant;
            const targetPhone = target.split('@')[0];
            if (!warnings[target]) warnings[target] = 0;
            warnings[target]++;

            if (warnings[target] >= 3) {
                delete warnings[target];
                try {
                    await sock.groupParticipantsUpdate(chatJid, [target], 'remove');
                    return reply(`❌ *Límite de Advertencias Alcanzado*\n\n@${targetPhone} acumuló 3 advertencias y ha sido expulsado automáticamente del grupo.`, { mentions: [target] });
                } catch (err) {
                    return reply(`⚠️ *Aviso*\n\n@${targetPhone} alcanzó 3 advertencias, pero no se pudo expulsar automáticamente (revisa los permisos del bot).`, { mentions: [target] });
                }
            } else {
                return reply(`⚠️ *Advertencia Registrada*\n\nUsuario: @${targetPhone}\nAcumulado: *${warnings[target]}/3* advertencias.`, { mentions: [target] });
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
                return reply('⚠️ *Acción Requerida*\n\nDebes citar un mensaje o etiquetar a la persona a la que deseas limpiar las advertencias.');
            }
            const targetPhone = target.split('@')[0];
            if (warnings[target]) {
                delete warnings[target];
                return reply(`✅ *Advertencias Limpiadas*\n\nSe han borrado todas las advertencias activas del usuario @${targetPhone}.`, { mentions: [target] });
            } else {
                return reply(`ℹ️ *Información*\n\nEl usuario @${targetPhone} no tiene ninguna advertencia registrada actualmente.`, { mentions: [target] });
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
                    return reply(`✅ *Nuevo Administrador*\n\n@${target.split('@')[0]} ha sido registrado como Administrador General.`, { mentions: [target] });
                } else {
                    return reply(`⚠️ *Aviso*\n\nEsa persona ya cuenta con el rol de administrador.`);
                }
            } else {
                return reply('⚠️ *Acción Requerida*\n\nDebes etiquetar a la persona (ej: `addadmin @usuario`).');
            }
        }

        if (texto.startsWith('deladmin')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                admins = admins.filter(a => !target.includes(a.split('@')[0]));
                return reply(`✅ *Administrador Removido*\n\nSe han retirado los privilegios de administrador general al usuario.`);
            } else {
                return reply('⚠️ *Acción Requerida*\n\nDebes etiquetar al administrador que deseas remover.');
            }
        }

        if (texto.startsWith('addsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                if (!soportes.includes(target)) {
                    soportes.push(target);
                    return reply(`✅ *Nuevo Miembro de Soporte*\n\n@${target.split('@')[0]} ahora forma parte del equipo de soporte.`, { mentions: [target] });
                } else {
                    return reply(`⚠️ *Aviso*\n\Esa persona ya forma parte del equipo de soporte.`);
                }
            } else {
                return reply('⚠️ *Acción Requerida*\n\nDebes etiquetar a la persona (ej: `addsoporte @usuario`).');
            }
        }

        if (texto.startsWith('delsoporte')) {
            const mentioned = m.message.extendedTextMessage?.contextInfo?.mentionedJid;
            if (mentioned && mentioned.length > 0) {
                const target = mentioned[0];
                soportes = soportes.filter(s => !target.includes(s.split('@')[0]));
                return reply(`✅ *Soporte Removido*\n\nEl usuario ha sido retirado del equipo de soporte.`);
            } else {
                return reply('⚠️ *Acción Requerida*\n\nDebes etiquetar al miembro de soporte que deseas remover.');
            }
        }

        if (texto === 'listaadmins') {
            const safeAdmins = admins.map(a => a.includes('@') ? a : `${a}@s.whatsapp.net`);
            const safeSoportes = soportes.map(s => s.includes('@') ? s : `${s}@s.whatsapp.net`);
            return reply(`👑 *LISTA DE ROLES ACTIVOS* 👑\n\n🛡️ *Administradores Generales:*\n${safeAdmins.map(a => '• @' + a.split('@')[0]).join('\n')}\n\n🛡️ *Miembros de Soporte:*\n${safeSoportes.map(s => '• @' + s.split('@')[0]).join('\n')}`, {
                mentions: [...safeAdmins, ...safeSoportes]
            });
        }

        // ==========================================
        // TOP SOPORTE (CON HORA GMT-6)
        // ==========================================
        if (texto === 'topsoporte') {
            if (Object.keys(statsAdmins).length === 0) {
                return reply('📊 *ESTADÍSTICAS VACÍAS*\n\nAún no hay registros de turnos atendidos.');
            }
            let topText = '🏆 *RANKING DE SOPORTE* 🏆\n*(Turnos Atendidos - Zona GMT-6)*\n\n';
            const sorted = Object.entries(statsAdmins).sort((a, b) => b[1] - a[1]);
            sorted.forEach(([jid, count], index) => {
                const phone = jid.split('@')[0];
                const lastTime = lastAttended[jid] 
                    ? new Date(lastAttended[jid]).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', dateStyle: 'short', timeStyle: 'medium' }) 
                    : 'N/A';
                topText += `${index + 1}. @${phone}\n   • 🎫 Turnos atendidos: *${count}*\n   • ⏰ Última atención: ${lastTime}\n\n`;
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
                    return reply('✅ *Plantilla Guardada*\n\nTu imagen personalizada ha sido registrada exitosamente. Utiliza `miplantilla` para verla en cualquier momento.');
                } catch (err) {
                    console.error(err);
                    return reply('⚠️ *Error*\n\nNo se pudo procesar y guardar la imagen. Inténtalo de nuevo.');
                }
            } else {
                return reply('⚠️ *Acción Requerida*\n\nDebes enviar una imagen adjunta escribiendo la palabra `adplantilla` en el pie de foto o texto.');
            }
        }

        if (texto === 'miplantilla') {
            const userPhone = senderDigits.slice(-10);
            const filePath = path.join(__dirname, 'plantillas', `${userPhone}.jpg`);
            if (fs.existsSync(filePath)) {
                const buffer = fs.readFileSync(filePath);
                await sock.sendMessage(chatJid, { image: buffer, caption: '📌 *Tu plantilla personal registrada:*' }, { quoted: m });
                return;
            } else {
                return reply('⚠️ *Sin Registro*\n\nAún no tienes ninguna plantilla guardada. Envía una fotografía junto con el comando `adplantilla`.');
            }
        }

        // ==========================================
        // COMANDOS PÚBLICOS
        // ==========================================
        if (texto === 'turno') {
            if (!registroDiario[cleanSender]) registroDiario[cleanSender] = 0;
            
            if (registroDiario[cleanSender] >= 2) {
                return reply('❌ *Límite Diario Alcanzado*\n\nYa has agotado tus 2 ayudas permitidas para el día de hoy.');
            }
            if (cola.some(t => t.sender === cleanSender) || turnosActivos[cleanSender]) {
                return reply('⚠️ *Turno en Proceso*\n\nYa te encuentras formado en la fila de espera o tienes un turno activo.');
            }

            const idTurno = 'T' + numTurno;
            cola.push({ 
                id: idTurno, 
                sender: cleanSender, 
                tiempoRegistro: Date.now() 
            });
            numTurno++;
            
            return reply(`✅ *TURNO GENERADO EXITOSAMENTE*\n\n🎫 *Código:* ${idTurno}\n📌 Mantente atento al grupo para tu respectivo llamado.\n\n📊 *Ayudas usadas hoy:* ${registroDiario[cleanSender]}/2`);
        }

        if (texto === 'miturno') {
            const ahora = Date.now();
            const cooldown = 30 * 60 * 1000; // 30 minutos
            if (lastMiturnoTime[cleanSender] && (ahora - lastMiturnoTime[cleanSender] < cooldown)) {
                const minutosRestantes = Math.ceil((cooldown - (ahora - lastMiturnoTime[cleanSender])) / 60000);
                return reply(`⏳ *Espera un momento*\n\nDebes aguardar ${minutosRestantes} minuto(s) más antes de volver a consultar el comando \`miturno\`.`);
            }
            lastMiturnoTime[cleanSender] = ahora;

            if (turnosActivos[cleanSender]) {
                const turnoActivo = turnosActivos[cleanSender];
                return reply(`🔔 *¡ATENCIÓN!*\n\nTu turno *${turnoActivo.id}* está actualmente en proceso de llamada. Revisa el chat del grupo.`);
            }

            const indexCola = cola.findIndex(t => t.sender === cleanSender);
            if (indexCola !== -1) {
                const miTurnoObj = cola[indexCola];
                const personasDelante = indexCola; 
                return reply(`🎫 *ESTADO DE TU TURNO*\n\n• *Código:* ${miTurnoObj.id}\n• *Posición en fila:* #${indexCola + 1}\n• *Personas por delante:* ${personasDelante}`);
            } else {
                return reply('⚠️ *Sin Turno Activo*\n\nNo te encuentras formado en la fila de espera actualmente. Escribe `turno` para solicitar uno.');
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
                return reply(`❌ *TURNO CANCELADO*\n\nEl turno ha sido retirado del sistema.\nℹ️ *Nota:* Esta cancelación cuenta como una de tus ayudas del día (${registroDiario[cleanSender]}/2).`);
            } else {
                return reply('⚠️ *Aviso*\n\nNo posees ningún turno activo ni estás formado en la fila para poder cancelarlo.');
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
                return reply(`✅ *TURNO CONFIRMADO*\n\n🎫 *Código:* ${turnoId}\n📊 *Progreso diario:* Llevas ${registroDiario[cleanSender]}/2 ayudas.\n\n💬 Envíale un mensaje privado al soporte asignado @${adminPhone}. Tienes un límite de 3 minutos para contactarlo y evitar que el turno se marque como atendido sin éxito.`, {
                    mentions: assignedAdmin ? [assignedAdmin] : []
                });
            } else {
                const enCola = cola.some(t => t.sender === cleanSender);
                if (enCola) {
                    return reply('⏳ *Espera tu turno*\n\nTodavía no has sido llamado por el equipo de soporte.');
                } else {
                    return reply('⚠️ *Aviso*\n\nNo tienes ningún llamado activo en este momento.');
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
                    return reply('⚠️ *Error*\n\nNo se encontraron las imágenes fijas en el servidor.');
                }
            } catch (error) {
                console.error(error);
                return reply('⚠️ *Error*\n\nOcurrió un fallo al intentar enviar las plantillas.');
            }
        }

        // ==========================================
        // COMANDOS DE SOPORTE
        // ==========================================
        if (texto === 'siguiente') {
            if (cola.length === 0) return reply('📭 *FILA VACÍA*\n\nNo hay ningún usuario esperando en la cola de turnos.');

            const turnoActual = cola.shift(); 
            
            if (!statsAdmins[cleanSender]) statsAdmins[cleanSender] = 0;
            statsAdmins[cleanSender]++;
            lastAttended[cleanSender] = Date.now(); 
            
            const userPhone = turnoActual.sender.split('@')[0];
            const adminPhone = cleanSender.split('@')[0];

            const msgLlamado = `📢 *TURNO EN ATENCIÓN*

────────────────────────
🎫 *Código de Turno:* ${turnoActual.id}
👤 *Usuario:* @${userPhone}
🛡️ *Soporte Asignado:* @${adminPhone}
────────────────────────

✅ *PARA CONFIRMAR TU TURNO RESPONDE:*
• aqui
• confirmo
• presente

⏳ *Tiempo límite:* Tienes 3 minutos para responder. 
⚠️ *Aviso:* Si no respondes a tiempo, el turno se finalizará automáticamente y tendrás que solicitar uno nuevo.`;

            await sock.sendMessage(chatJid, {
                text: msgLlamado,
                mentions: [turnoActual.sender, cleanSender]
            });

            turnosActivos[turnoActual.sender] = {
                id: turnoActual.id,
                admin: cleanSender,
                timer: setTimeout(async () => {
                    await sock.sendMessage(chatJid, {
                        text: `❌ *TURNO VENCIDO*\n\n@${userPhone} no respondió dentro del tiempo establecido. El turno ${turnoActual.id} ha sido finalizado automáticamente.`,
                        mentions: [turnoActual.sender]
                    });
                    
                    registroDiario[turnoActual.sender] = (registroDiario[turnoActual.sender] || 0) + 1;
                    delete turnosActivos[turnoActual.sender];
                }, 180000)
            };
            return;
        }

        if (texto === 'turnos') {
            if (cola.length === 0) return reply('📭 *FILA VACÍA*\n\nActualmente no hay usuarios esperando en la cola.');
            
            let lista = `📋 *LISTA DE TURNOS PENDIENTES* (${cola.length})\n\n`;
            const ahora = Date.now();

            cola.forEach((t) => {
                const minEspera = Math.floor((ahora - t.tiempoRegistro) / 60000); 
                lista += `• 🎫 *${t.id}* ➔ @${t.sender.split('@')[0]} (*${minEspera} min* en espera)\n`;
            });

            return sock.sendMessage(chatJid, { text: lista, mentions: cola.map(t => t.sender) });
        }

        if (texto.startsWith('atendido')) {
            const partes = texto.split(/\s+/);
            const idBuscar = partes.find(p => p.startsWith('t'));
            
            if (!idBuscar) return reply('⚠️ *Formato Incorrecto*\n\nUtiliza el comando de la siguiente manera:\n`atendido T1800`');
            
            const idMayus = idBuscar.toUpperCase();
            const index = cola.findIndex(t => t.id === idMayus);
            
            if (index !== -1) {
                const removido = cola.splice(index, 1)[0];
                registroDiario[removido.sender] = (registroDiario[removido.sender] || 0) + 1;
                
                if (!statsAdmins[cleanSender]) statsAdmins[cleanSender] = 0;
                statsAdmins[cleanSender]++;
                lastAttended[cleanSender] = Date.now(); 

                return reply(`✅ *Turno Atendido*\n\nEl turno *${idMayus}* ha sido retirado de la fila y marcado como atendido con éxito.`);
            } else {
                return reply(`⚠️ *No Encontrado*\n\nNo se localizó ningún turno con el código *${idMayus}* dentro de la fila de pendientes.`);
            }
        }
    });
}

startBot();
