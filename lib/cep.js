const RE_CEP = /^\d{8}$/;

export function normalizarCep(cep) {
  const digitos = String(cep || "").replace(/\D/g, "");
  if (!RE_CEP.test(digitos)) {
    throw new Error("CEP inválido.");
  }
  return digitos;
}

function noBrasil(latitude, longitude) {
  return latitude >= -34 && latitude <= 6 && longitude >= -74 && longitude <= -32;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function extrairCoordenada(latitude, longitude) {
  const lat = numero(latitude);
  const lng = numero(longitude);
  if (lat === null || lng === null || !noBrasil(lat, lng)) return null;
  return [lat, lng];
}

export function distanciaKm(lat1, lon1, lat2, lon2) {
  const raio = 6371;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 2 * raio * Math.asin(Math.sqrt(a));
}

export function linkGoogleMaps(local) {
  let endereco = String(local.endereco || "").replace(/\s*CEP:\s*\d{5}-?\d{3}/i, "");
  endereco = endereco.replace(/\s+-\s+[A-Za-zÀ-ÿ\s]+$/, "").replace(/^[\s,]+|[\s,]+$/g, "");
  const consulta = [local.nome, endereco, "Brasil"].filter(Boolean).join(" ");
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(consulta);
}

function enderecoBrasilApi(dados, cep) {
  const coordenadas = dados.location?.coordinates || {};
  const ponto = extrairCoordenada(coordenadas.latitude, coordenadas.longitude);
  return {
    cep,
    logradouro: dados.street || null,
    bairro: dados.neighborhood || null,
    cidade: dados.city || null,
    uf: dados.state || null,
    latitude: ponto ? ponto[0] : null,
    longitude: ponto ? ponto[1] : null,
  };
}

function enderecoAwesome(dados, cep) {
  const ponto = extrairCoordenada(dados.lat, dados.lng);
  return {
    cep,
    logradouro: dados.address || null,
    bairro: dados.district || dados.neighborhood || null,
    cidade: dados.city || null,
    uf: dados.state || null,
    latitude: ponto ? ponto[0] : null,
    longitude: ponto ? ponto[1] : null,
  };
}

function completar(base, extra) {
  for (const campo of ["logradouro", "bairro", "cidade", "uf", "latitude", "longitude"]) {
    if (!base[campo] && extra[campo]) base[campo] = extra[campo];
  }
  return base;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url) {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    try {
      const resposta = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (resposta.status === 404) return null;
      if ([429, 500, 502, 503, 504].includes(resposta.status)) {
        await sleep(800 * (tentativa + 1));
        continue;
      }
      if (resposta.status !== 200) return null;
      const dados = await resposta.json();
      if (!dados || typeof dados !== "object" || Array.isArray(dados) || dados.erro === true) return null;
      return dados;
    } catch {
      await sleep(600 * (tentativa + 1));
    }
  }
  return null;
}

export async function consultarCep(cep) {
  const endereco = {
    cep,
    logradouro: null,
    bairro: null,
    cidade: null,
    uf: null,
    latitude: null,
    longitude: null,
  };

  // awesomeapi traz a coordenada da rua; brasilapi as vezes devolve so o centro da cidade
  const awesome = await getJson(`https://cep.awesomeapi.com.br/json/${cep}`);
  if (awesome && ![400, 404, "400", "404"].includes(awesome.status)) {
    completar(endereco, enderecoAwesome(awesome, cep));
  }

  const brasil = await getJson(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  if (brasil) completar(endereco, enderecoBrasilApi(brasil, cep));

  if (!endereco.cidade) {
    const viacep = await getJson(`https://viacep.com.br/ws/${cep}/json/`);
    if (viacep) {
      completar(endereco, {
        cep,
        logradouro: viacep.logradouro || null,
        bairro: viacep.bairro || null,
        cidade: viacep.localidade || null,
        uf: viacep.uf || null,
        latitude: null,
        longitude: null,
      });
    }
  }

  if (!endereco.cidade && !endereco.logradouro && endereco.latitude == null) return null;
  return endereco;
}

export async function geocodificarCidade(cidade, estado) {
  if (!cidade || !estado) return null;
  await sleep(1100);
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", `${cidade}, ${estado}, Brasil`);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");
    const resposta = await fetch(url, {
      headers: { "User-Agent": "maternop/1.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (!resposta.ok) return null;
    const dados = await resposta.json();
    if (!dados?.length) return null;
    return extrairCoordenada(dados[0].lat, dados[0].lon);
  } catch {
    return null;
  }
}
