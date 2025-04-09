const net = require("net");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");

let historicoDiario = [];

let dataAtual = new Date().toLocaleDateString("pt-BR");

// Configuração da balança
require("dotenv").config();
const BALANCA_IP = process.env.BALANCA_IP;
const BALANCA_PORTA = process.env.BALANCA_PORTA;
const PORTA_WEB = process.env.PORTA_WEB || 3000;

// App Express + Socket.IO
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Servir arquivos estáticos (index.html)
app.use(express.static(path.join(__dirname, "public")));

// Rota para retornar relatório diário em JSON
app.get("/relatorio", (req, res) => {
  res.json(historicoDiario);
});

// Rota para baixar relatório diário em formato .txt
app.get("/relatorio.txt", (req, res) => {
  const conteudo = historicoDiario
    .map((registro) => `${registro.timestamp} - ${registro.peso} kg`)
    .join("\n");

  res.setHeader("Content-Disposition", "attachment; filename=relatorio.txt");
  res.setHeader("Content-Type", "text/plain");
  res.send(conteudo);
});

// Conecta à balança como cliente TCP
const client = new net.Socket();
client.connect(BALANCA_PORTA, BALANCA_IP, () => {
  console.log(`Conectado à balança em ${BALANCA_IP}:${BALANCA_PORTA}`);
});

// Lógica de estabilização de peso
let ultimosPesos = [];
let pesoAnterior = null;

client.on("data", (data) => {
  const pesoBruto = data.toString().trim();
  const peso = parseFloat(pesoBruto);
  if (isNaN(peso)) return;

  console.log(`Peso recebido: ${peso}`);
  io.emit("peso", peso);

  ultimosPesos.push(peso);
  if (ultimosPesos.length > 3) ultimosPesos.shift();

  const todosIguais = ultimosPesos.every((p) => p === ultimosPesos[0]);

  if (todosIguais && peso !== pesoAnterior && peso >= 200) {
    pesoAnterior = peso;

    const agora = new Date();
    const timestamp = agora.toLocaleString("pt-BR");

    historicoDiario.unshift({ peso, timestamp });
    io.emit("historico", { peso, timestamp });

    console.log(`Peso estabilizado: ${peso} kg às ${timestamp}`);

    // Zera o histórico se for outro dia
    const novaData = agora.toLocaleDateString("pt-BR");
    if (novaData !== dataAtual) {
      historicoDiario = [];
      dataAtual = novaData;
      console.log("Novo dia detectado, histórico zerado.");
    }
  }
});

client.on("error", (err) => {
  console.error("Erro na conexão com a balança:", err.message);
});

client.on("close", () => {
  console.log("Conexão encerrada pela balança");
});

// Inicia o servidor web

server.listen(PORTA_WEB, () => {
  console.log(`Interface web disponível em http://localhost:${PORTA_WEB}`);
});
