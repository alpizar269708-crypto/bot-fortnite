const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const express = require('express');
const fs = require('fs');

const app = express();
let qrImagen = ''; // Aquí se guardará la imagen del QR

// Servidor web que mostrará el QR perfecto en el navegador
app.get('/', (req, res) => {
    if (qrImagen) {
        res.send(`
            <html>
                <head><title>Escanear Bot Fortnite</title></head>
                <body style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background:#111; color:#fff;">
                    <h2>Escanea este código con tu WhatsApp</h2>
                    <img src="${qrImagen}" style="border: 10px solid white; border-radius: 10px; width: 300px; height: 300px;"/>
                    <p>Si caduca, refresca esta página web (F5)</p>
                </body>
            </html>
        `);
    } else {
        res.send(`
            <html>
                <body style="display:flex; align-items:center; justify-content:center; height:100vh; font-family:sans-serif; background:#111; color:#fff;">
                    <h2>El bot ya está conectado o está generando un nuevo QR... Espera unos segundos y recarga (F5).</h2>
                </body>
            </html>
        `);
    }
});

app.listen(process.env.PORT || 3000, () => console.log('Servidor web en línea'));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

// ==========================================
// CONFIGURACIÓN DE LOS ADMINS
// ==========================================
const admins = [
    '34623421390@c.us', '51970905290@c.us', '5219842416884@c.us',
    '5216147914642@c.us', '5218261510387@c.us', '5217821662353@c.us',
    '5219624023210@c.us', '50684477977@c.us', '5217773243291@c.us',
    '593996122609@c.us', '5492616395161@c.us', '554788902892@c.us',
    '5216862456423@c.us', '5217821420226@c.us', '16024871043@c.us',
    '593978930965@c.us', '5217205552328@c.us'
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

// Convertir el QR en una imagen PNG para mostrar en la web
client.on('qr', qr => {
    qrcode.toDataURL(qr, (err, url) => {
        qrImagen = url;
        console.log('=== NUEVO CÓDIGO QR GENERADO EN LA PÁGINA WEB ===');
    });
});

client.on('ready', () => {
    qrImagen = ''; // Limpiar el QR al conectar
    console.log('Bot conectado y listo para los turnos!');
});

client.on('message', async msg => {
    const chat = await msg.getChat();
    const texto = msg.body.toLowerCase().trim();
    const sender = msg.author || msg.from; 
    const isAdmin = admins.includes(sender); 
    
    revisarDia();

    if (texto === 'turno') {
        if (!registroDiario[sender]) registroDiario[sender] = 0;
        
        if (registroDiario[sender] >= 2) {
            return msg.reply('❌ Ya agotaste tus 2 ayudas del día de hoy.');
        }
        if (cola.some(t => t.sender === sender) || turnosActivos[sender]) {
            return msg.reply('⚠️ Ya estás en la fila o tienes un turno activo.');
        }

        const idTurno = 'T' + numTurno;
        cola.push({ 
            id: idTurno, 
            sender: sender, 
            tiempoRegistro: Date.now() 
        });
        numTurno++;
        
        return msg.reply(`✅ *Turno generado exitosamente: ${idTurno}*\nEspera tu llamado en el grupo.\n\n📊 *Ayudas solicitadas hoy:* ${registroDiario[sender]}/2`);
    }

    const palabrasConfirmacion = ['aqui', 'aquí', 'confirmo', 'presente', '.aqui', '.aquí', '.confirmo', '.presente'];
    
    if (palabrasConfirmacion.includes(texto)) {
        if (turnosActivos[sender]) {
            clearTimeout(turnosActivos[sender].timer); 
            const turnoId = turnosActivos[sender].id;
            delete turnosActivos[sender]; 
            
            registroDiario[sender] += 1; 
            return msg.reply(`✅ Confirmado (Turno ${turnoId}). Llevas ${registroDiario[sender]}/2 ayudas hoy. ¡Procedan!`);
        }
    }

    if (texto === 'plantilla') {
        try {
            let enviadas = 0;
            for (const foto of misFotos) {
                if (fs.existsSync('./' + foto)) {
                    const media = MessageMedia.fromFilePath('./' + foto);
                    await chat.sendMessage(media);
                    enviadas++;
                }
            }
            if (enviadas === 0) {
                return msg.reply('⚠️ Error: No se encontraron las imágenes en el servidor.');
            }
        } catch (error) {
            console.error(error);
            return msg.reply('⚠️ Error al enviar las plantillas.');
        }
    }

    if (!isAdmin) return; 

    if (texto === 'siguiente') {
        if (cola.length === 0) return msg.reply('📭 No hay nadie en la fila.');

        const turnoActual = cola.shift(); 
        
        if (!statsAdmins[sender]) statsAdmins[sender] = 0;
        statsAdmins[sender]++;
        
        let rango = "Soporte Técnico";
        if (statsAdmins[sender] >= 50) rango = "Veterano";
        if (statsAdmins[sender] >= 100) rango = "👑 Rey del Soporte";

        const msgLlamado = `📢 *TURNO EN ATENCIÓN*

🎫 Turno:
*${turnoActual.id}*

👤 Usuario:
@${turnoActual.sender.split('@')[0]}
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
@${sender.split('@')[0]}
________________________

🕵️‍♂️ *INFORMACIÓN DEL SOPORTE*

🎫 Turnos atendidos: ${statsAdmins[sender]}

🎖️ Rango:
${rango}
________________________

⚠️ Si no confirmas dentro del tiempo límite, el turno será finalizado automáticamente y tendrás que solicitar uno nuevo.

🤖 Sistema de Gestión de Turnos`;

        await chat.sendMessage(msgLlamado, {
            mentions: [turnoActual.sender, sender]
        });

        turnosActivos[turnoActual.sender] = {
            id: turnoActual.id,
            timer: setTimeout(async () => {
                await chat.sendMessage(`❌ @${turnoActual.sender.split('@')[0]} no respondió. El turno ${turnoActual.id} ha sido finalizado automáticamente.`, { mentions: [turnoActual.sender] });
                
                registroDiario[turnoActual.sender] = (registroDiario[turnoActual.sender] || 0) + 1;
                delete turnosActivos[turnoActual.sender];
            }, 180000)
        };
        return;
    }

    if (texto === 'turnos') {
        if (cola.length === 0) return msg.reply('📭 La fila está vacía.');
        
        let lista = `📋 *LISTA DE TURNOS*\n\n📊 Total en cola: ${cola.length}\n\n`;
        const ahora = Date.now();

        cola.forEach((t) => {
            const minEspera = Math.floor((ahora - t.tiempoRegistro) / 60000); 
            lista += `🎫 ${t.id}\n📌 Estado: PENDIENTE\n👤 @${t.sender.split('@')[0]}\n⏳ Espera: ${minEspera} min\n\n`;
        });

        return chat.sendMessage(lista, { mentions: cola.map(t => t.sender) });
    }

    if (texto.startsWith('atendido')) {
        const partes = texto.split(/[\s.]+/);
        const idBuscar = partes.find(p => p.startsWith('t'));
        
        if (!idBuscar) return msg.reply('⚠️ Usa el formato: Atendido . T1800');
        
        const idMayus = idBuscar.toUpperCase();
        const index = cola.findIndex(t => t.id === idMayus);
        
        if (index !== -1) {
            const removido = cola.splice(index, 1)[0];
            registroDiario[removido.sender] = (registroDiario[removido.sender] || 0) + 1;
            
            if (!statsAdmins[sender]) statsAdmins[sender] = 0;
            statsAdmins[sender]++;

            return msg.reply(`✅ Turno ${idMayus} retirado de la fila y marcado como atendido.`);
        } else {
            return msg.reply(`⚠️ No se encontró el turno ${idMayus} en la fila.`);
        }
    }
});

client.initialize();
