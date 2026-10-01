import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import express from "express";
import { atualizar } from "./atualizar.js";
import { FONTE, arquivoDocs, carregarLocais } from "./lib/catalogo.js";
import { consultarCep, distanciaKm, linkGoogleMaps, normalizarCep } from "./lib/cep.js";

const catalogo = { locais: [], atualizado_em: null, fonte: FONTE };

function erro(res, status, detail) {
  return res.status(status).json({ detail });
}

function limiteValido(valor) {
  if (valor === undefined) return 5;
  if (!/^\d+$/.test(String(valor))) return null;
  const n = Number(valor);
  if (n < 1 || n > 20) return null;
  return n;
}

const app = express();

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "*");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/docs", async (_req, res) => {
  const html = await readFile(arquivoDocs, "utf8");
  res.type("html").send(html);
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    locais: catalogo.locais.length,
    com_coordenada: catalogo.locais.filter((local) => local.latitude != null).length,
    atualizado_em: catalogo.atualizado_em,
    fonte: catalogo.fonte,
  });
});

app.get("/locais", async (req, res) => {
  let cep;
  try {
    cep = normalizarCep(req.query.cep);
  } catch (err) {
    return erro(res, 400, err.message);
  }

  const limite = limiteValido(req.query.limite);
  if (limite === null) return erro(res, 400, "limite inválido.");
  if (!catalogo.locais.length) return erro(res, 503, "Lista de locais vazia.");

  let endereco;
  try {
    endereco = await consultarCep(cep);
  } catch {
    return erro(res, 502, "Falha ao consultar o CEP.");
  }

  if (!endereco) return erro(res, 404, "CEP não encontrado.");
  if (endereco.latitude == null || endereco.longitude == null) {
    return erro(res, 422, "CEP sem coordenada.");
  }

  const ordenados = [];
  for (const local of catalogo.locais) {
    if (local.latitude == null || local.longitude == null) continue;
    const km = distanciaKm(endereco.latitude, endereco.longitude, local.latitude, local.longitude);
    ordenados.push([km, local]);
  }
  ordenados.sort((a, b) => a[0] - b[0]);

  const locais = ordenados.slice(0, limite).map(([km, local]) => ({
    nome: local.nome,
    tipo: local.tipo || "",
    contato: local.contato,
    endereco: local.endereco || "",
    cep: local.cep,
    cidade: local.cidade,
    estado: local.estado,
    uf: local.uf,
    distancia_km: Math.round(km * 10) / 10,
    distancia_aproximada: local.precisao === "cidade",
    google_maps: linkGoogleMaps(local),
  }));

  res.json({
    cep,
    endereco: {
      cep,
      logradouro: endereco.logradouro,
      bairro: endereco.bairro,
      cidade: endereco.cidade,
      uf: endereco.uf,
      latitude: endereco.latitude,
      longitude: endereco.longitude,
    },
    quantidade: locais.length,
    fonte: catalogo.fonte,
    locais,
  });
});

const dados = (await carregarLocais()) || (await atualizar());
catalogo.locais = dados.locais || [];
catalogo.atualizado_em = dados.atualizado_em;
catalogo.fonte = dados.fonte || FONTE;

function ipsDaRede() {
  const ips = [];
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const rede of lista || []) {
      const v4 = rede.family === "IPv4" || rede.family === 4;
      if (!v4 || rede.internal) continue;
      if (rede.address.startsWith("169.254.")) continue;
      ips.push(rede.address);
    }
  }
  const peso = (ip) => {
    if (ip.startsWith("192.168.")) return 0;
    if (ip.startsWith("10.")) return 1;
    return 2;
  };
  return ips.sort((a, b) => peso(a) - peso(b));
}

const porta = Number(process.env.PORT) || 8000;

app.listen(porta, "0.0.0.0", () => {
  const ips = ipsDaRede();
  const host = ips[0] || "127.0.0.1";
  const url = `http://${host}:${porta}`;
  console.log(url);
  console.log(`${url}/docs`);
  for (const ip of ips.slice(1)) console.log(`http://${ip}:${porta}`);
  if (process.platform === "win32") exec(`start "" "${url}/docs"`);
});
