/**
 * Popula o campo cityPopulation nos polos usando dados do Censo 2022 (IBGE).
 * API: https://servicodados.ibge.gov.br/api/v3/agregados/9514/periodos/2022/variaveis/93
 */

import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Carregar .env.local manualmente
try {
  const env = readFileSync(".env.local", "utf-8");
  for (const line of env.split("\n")) {
    const [k, ...v] = line.split("=");
    if (k && v.length) process.env[k.trim()] = v.join("=").trim();
  }
} catch {}

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function normalizeCity(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

const UF_CODE = {
  AC: 12, AL: 27, AM: 13, AP: 16, BA: 29, CE: 23, DF: 53, ES: 32,
  GO: 52, MA: 21, MG: 31, MS: 50, MT: 51, PA: 15, PB: 25, PE: 26,
  PI: 22, PR: 41, RJ: 33, RN: 24, RO: 11, RR: 14, RS: 43, SC: 42,
  SE: 28, SP: 35, TO: 17,
};

async function fetchIBGE() {
  console.log("Buscando municípios do IBGE...");
  const resp = await fetch(
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome",
    { headers: { Accept: "application/json" } }
  );
  const municipios = await resp.json();
  console.log(`${municipios.length} municípios carregados.`);

  // Buscar populações do Censo 2022 - tabela 9514, variável 93 (população residente)
  console.log("Buscando populações do Censo 2022...");
  const popResp = await fetch(
    "https://servicodados.ibge.gov.br/api/v3/agregados/9514/periodos/2022/variaveis/93?localidades=N6[all]",
    { headers: { Accept: "application/json" } }
  );
  const popData = await popResp.json();
  const resultados = popData?.[0]?.resultados?.[0]?.series ?? [];

  const popById = {};
  for (const series of resultados) {
    const id = series.localidade?.id;
    const val = series.serie?.["2022"];
    if (id && val) popById[id] = parseInt(val, 10);
  }
  console.log(`${Object.keys(popById).length} populações carregadas.`);

  // Montar lookup: { "uf:nomecidade": population }
  const lookup = {};
  for (const m of municipios) {
    const uf = m.microrregiao?.mesorregiao?.UF?.sigla;
    const ibgeId = String(m.id);
    const pop = popById[ibgeId];
    if (!uf || !pop) continue;
    const key = `${uf}:${normalizeCity(m.nome)}`;
    lookup[key] = pop;
  }

  return lookup;
}

async function main() {
  const lookup = await fetchIBGE();

  const polos = await prisma.polo.findMany({ select: { id: true, city: true, uf: true } });
  console.log(`\nAtualizando ${polos.length} polos...`);

  let matched = 0;
  let unmatched = 0;

  for (const polo of polos) {
    const key = `${polo.uf}:${normalizeCity(polo.city)}`;
    const pop = lookup[key];
    if (pop) {
      await prisma.polo.update({ where: { id: polo.id }, data: { cityPopulation: pop } });
      matched++;
    } else {
      // Tentar match parcial (cidade pode ter sufixo como "Dist." ou parênteses)
      const partial = Object.entries(lookup).find(([k]) => k.startsWith(`${polo.uf}:`) && normalizeCity(polo.city).startsWith(k.split(":")[1].slice(0, 6)));
      if (partial) {
        await prisma.polo.update({ where: { id: polo.id }, data: { cityPopulation: partial[1] } });
        matched++;
      } else {
        unmatched++;
        console.log(`  Sem match: ${polo.uf} ${polo.city}`);
      }
    }
  }

  console.log(`\nConcluído: ${matched} atualizados, ${unmatched} sem correspondência.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
