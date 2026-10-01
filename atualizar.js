import {
  aplicarCoordenadas,
  baixarCatalogo,
  carregarCoordenadas,
  salvarCoordenadas,
  salvarLocais,
} from "./lib/catalogo.js";
import { consultarCep, geocodificarCidade } from "./lib/cep.js";

const CONCORRENCIA = 4;

async function emLote(itens, fn) {
  const fila = [...itens];
  await Promise.all(
    Array.from({ length: CONCORRENCIA }, async () => {
      while (fila.length) {
        const item = fila.shift();
        await fn(item);
      }
    })
  );
}

async function geocodificarCeps(ceps, coordenadas) {
  let feitos = 0;
  const total = ceps.length;

  await emLote(ceps, async (cep) => {
    const endereco = await consultarCep(cep);
    coordenadas[cep] =
      endereco?.latitude != null
        ? {
            latitude: endereco.latitude,
            longitude: endereco.longitude,
            precisao: "cep",
            cidade: endereco.cidade,
            uf: endereco.uf,
          }
        : null;
    feitos += 1;
    if (feitos % 25 === 0 || feitos === total) {
      console.log(`CEPs consultados: ${feitos}/${total}`);
      await salvarCoordenadas(coordenadas);
    }
  });
}

async function completarPorCidade(locais, coordenadas) {
  const pendentes = new Map();
  for (const local of locais) {
    if (!local.cep || coordenadas[local.cep]?.latitude != null) continue;
    if (!local.cidade || !local.estado) continue;
    const chave = `${local.cidade}|${local.estado}`;
    if (!pendentes.has(chave)) pendentes.set(chave, { cidade: local.cidade, estado: local.estado, ceps: [] });
    pendentes.get(chave).ceps.push(local.cep);
  }
  if (!pendentes.size) return;

  console.log(`Completando ${pendentes.size} cidades sem coordenada de CEP...`);
  let feitos = 0;
  for (const grupo of pendentes.values()) {
    const ponto = await geocodificarCidade(grupo.cidade, grupo.estado);
    for (const cep of grupo.ceps) {
      if (ponto) {
        coordenadas[cep] = {
          latitude: ponto[0],
          longitude: ponto[1],
          precisao: "cidade",
          cidade: grupo.cidade,
          uf: null,
        };
      } else if (!(cep in coordenadas) || coordenadas[cep] == null) {
        coordenadas[cep] = null;
      }
    }
    feitos += 1;
    if (feitos % 10 === 0 || feitos === pendentes.size) {
      console.log(`Cidades consultadas: ${feitos}/${pendentes.size}`);
      await salvarCoordenadas(coordenadas);
    }
  }
}

export async function atualizar() {
  console.log("Baixando locais de coleta na rBLH...");
  const locais = await baixarCatalogo();
  console.log(`${locais.length} locais encontrados.`);

  const coordenadas = await carregarCoordenadas();
  const ceps = [...new Set(locais.map((local) => local.cep).filter(Boolean))].sort();
  const faltando = ceps.filter((cep) => coordenadas[cep]?.latitude == null);
  if (faltando.length) {
    console.log(`Buscando coordenadas de ${faltando.length} CEPs...`);
    await geocodificarCeps(faltando, coordenadas);
    await completarPorCidade(locais, coordenadas);
    await salvarCoordenadas(coordenadas);
  }

  aplicarCoordenadas(locais, coordenadas);
  const payload = await salvarLocais(locais);
  const comPonto = locais.filter((local) => local.latitude != null).length;
  console.log(`Catálogo salvo. ${comPonto}/${locais.length} locais com coordenada.`);
  return payload;
}

if (process.argv[1] && process.argv[1].endsWith("atualizar.js")) {
  atualizar().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
