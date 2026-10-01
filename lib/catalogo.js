import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const pastaDados = path.join(raiz, "data");
export const arquivoLocais = path.join(pastaDados, "locais.json");
export const arquivoCoordenadas = path.join(pastaDados, "coordenadas.json");
export const arquivoDocs = path.join(raiz, "docs.html");

export const URL_RBLH = "https://rblh.fiocruz.br/localizacao-dos-blhs";
export const FONTE = "Rede Brasileira de Bancos de Leite Humano (Fiocruz)";

const UF_POR_ESTADO = {
  Acre: "AC",
  Alagoas: "AL",
  Amapá: "AP",
  Amazonas: "AM",
  Bahia: "BA",
  Ceará: "CE",
  "Distrito Federal": "DF",
  "Espírito Santo": "ES",
  Goiás: "GO",
  Maranhão: "MA",
  "Mato Grosso": "MT",
  "Mato Grosso do Sul": "MS",
  "Minas Gerais": "MG",
  Pará: "PA",
  Paraíba: "PB",
  Paraná: "PR",
  Pernambuco: "PE",
  Piauí: "PI",
  "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS",
  Rondônia: "RO",
  Roraima: "RR",
  "Santa Catarina": "SC",
  "São Paulo": "SP",
  Sergipe: "SE",
  Tocantins: "TO",
};

const TIPOS = {
  "Banco de Leite": "Banco de Leite",
  "Centro de Referência": "Centro de Referência",
  "Posto Coleta": "Posto de Coleta",
};

const RE_CEP = /CEP:\s*(\d{5})-?(\d{3})/i;
const RE_CIDADE_UF = /,\s*([^,]+?)\s*,\s*([A-Z]{2})\s*,\s*CEP:/i;

function texto($el) {
  return $el.text().replace(/\s+/g, " ").trim();
}

export function analisarCatalogo(html) {
  const $ = cheerio.load(html);
  const locais = [];

  $("div.view-grouping").each((_, grupo) => {
    const estado = texto($(grupo).children("div.view-grouping-header"));
    const ufEstado = UF_POR_ESTADO[estado];

    $(grupo).find("div.item-list").each((__, bloco) => {
      const tipoBruto = texto($(bloco).children("h3"));
      const tipo = TIPOS[tipoBruto] || tipoBruto;

      $(bloco).find("li").each((___, item) => {
        const nome = texto($(item).find("a").first());
        if (!nome) return;

        const endereco = texto($(item).find(".endereco").first());
        const telefone = texto($(item).find(".telefone").first());
        const contato = telefone.replace(/^Telefone:\s*/i, "").trim() || null;

        const cepMatch = endereco.match(RE_CEP);
        const cep = cepMatch ? cepMatch[1] + cepMatch[2] : null;

        let cidade = null;
        let uf = ufEstado;
        const cidadeMatch = endereco.match(RE_CIDADE_UF);
        if (cidadeMatch) {
          cidade = cidadeMatch[1].replace(/^[\s-]+|[\s-]+$/g, "");
          uf = cidadeMatch[2].toUpperCase();
        }

        locais.push({
          nome,
          tipo,
          contato,
          endereco,
          cep,
          cidade,
          estado,
          uf,
          latitude: null,
          longitude: null,
          precisao: null,
        });
      });
    });
  });

  return locais;
}

export async function baixarCatalogo() {
  const resposta = await fetch(URL_RBLH, {
    headers: { "User-Agent": "maternop/1.0", Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });
  if (!resposta.ok) throw new Error("Falha ao baixar a lista da rBLH.");
  const locais = analisarCatalogo(await resposta.text());
  if (locais.length < 100) {
    throw new Error("A página da rBLH não retornou a lista esperada de locais de coleta.");
  }
  return locais;
}

export async function carregarCoordenadas() {
  try {
    return JSON.parse(await readFile(arquivoCoordenadas, "utf8"));
  } catch {
    return {};
  }
}

export async function salvarCoordenadas(coordenadas) {
  await mkdir(pastaDados, { recursive: true });
  await writeFile(arquivoCoordenadas, JSON.stringify(coordenadas, null, 2), "utf8");
}

export function aplicarCoordenadas(locais, coordenadas) {
  for (const local of locais) {
    const ponto = local.cep ? coordenadas[local.cep] : null;
    if (!ponto) continue;
    local.latitude = ponto.latitude ?? null;
    local.longitude = ponto.longitude ?? null;
    local.precisao = ponto.precisao ?? null;
  }
  return locais;
}

export async function salvarLocais(locais) {
  await mkdir(pastaDados, { recursive: true });
  const payload = {
    atualizado_em: new Date().toISOString(),
    fonte: FONTE,
    url: URL_RBLH,
    total: locais.length,
    locais,
  };
  await writeFile(arquivoLocais, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function carregarLocais() {
  try {
    return JSON.parse(await readFile(arquivoLocais, "utf8"));
  } catch {
    return null;
  }
}
