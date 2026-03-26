import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const samplePolos = [
  {
    code: 2054,
    name: "PAP CURITIBA (BATEL) - PR",
    uf: "PR",
    city: "Curitiba",
    neighborhood: "Batel",
    street: "Av. Sete de Setembro, 4228 Tereo",
    agent: "ALVARO JOSE DE OLIVEIRA",
    manager: "ALVARO JOSE DE OLIVEIRA",
    phone: "(41)21023433",
    email: "polocuritibabatel@uninter.com",
  },
  {
    code: 966,
    name: "PAP CURITIBA (CARLOS GOMES) - PR",
    uf: "PR",
    city: "Curitiba",
    neighborhood: "Centro",
    street: "Rua Pedro Ivo, 504",
    agent: "SUSAN MORITZ",
    manager: "ZENEIDO RODRIGUES LEAL",
    phone: "(41)35958100",
    email: "polocuritibacarlosgomes@uninter.com",
  },
  {
    code: 454,
    name: "PAP SAO JOSE DOS PINHAIS (CENTRO) - PR",
    uf: "PR",
    city: "Sao Jose dos Pinhais",
    neighborhood: "Centro",
    street: "Rua Barao do Cerro Azul, 761",
    agent: "VENISE MATHIAS PINTO DE MELO",
    manager: "ANNE ELLING",
    phone: "(41)30354119",
    email: "polosaojosedospinhaiscentro@uninter.com",
  },
  {
    code: 85,
    name: "PAP LONDRINA (CENTRO CALCADAO) - PR",
    uf: "PR",
    city: "Londrina",
    neighborhood: "Centro",
    street: "Avenida Parana, 646",
    agent: "SANDRO MACEDO MELLO",
    manager: "BERNARDO KUCINSKI SERALE",
    phone: "(43)33612040",
    email: "pololondrina@uninter.com",
  },
  {
    code: 2680,
    name: "PAP SAO PAULO (CENTRO) - SP",
    uf: "SP",
    city: "Sao Paulo",
    neighborhood: "Centro",
    street: "Rua Libero Badaro, 292",
    agent: "DOUGLAS LUIZ DA SILVA",
    manager: "DOUGLAS LUIZ DA SILVA",
    phone: "(11)986648088",
    email: "polosaopaulocentro@uninter.com",
  },
  {
    code: 228,
    name: "PAP CAMPINAS (GLICERIO - LAPAD) - SP",
    uf: "SP",
    city: "Campinas",
    neighborhood: "Centro",
    street: "Avenida Francisco Glicerio, 519",
    agent: "IGOR VIGINOTTI CANEVARE",
    manager: "IGOR VIGINOTTI CANEVARE",
    phone: "(19)998998441",
    email: "polocampinasglicerio@uninter.com",
  },
  {
    code: 931,
    name: "PAP SANTOS (CONSELHEIRO NEBIAS - LAPAD) - SP",
    uf: "SP",
    city: "Santos",
    neighborhood: "Vila Mathias",
    street: "R. Silva Jardim, 320 Letra A",
    agent: "TATHIANY VALVERDE GRANJA FERNANDES",
    manager: "NEILA KARINA RODRIGUES",
    phone: "(13)33492311",
    email: "polosantosconselheironebias@uninter.com",
  },
];

async function main() {
  for (const polo of samplePolos) {
    await prisma.polo.upsert({
      where: { code: polo.code },
      update: polo,
      create: polo,
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
