-- ──────────────────────────────────────────────────────────────────────────────
-- SLA de MQL — tabelas de configuração + log de mudanças
-- ──────────────────────────────────────────────────────────────────────────────

create table if not exists sla_mql_rows (
  id               bigint generated always as identity primary key,
  vertical         text    not null,
  nome             text    not null,
  status           boolean not null default true,
  commercial_squad text    not null default '',
  mql_intencoes    jsonb   not null default '[]',
  mql_faixas       jsonb   not null default '[]',
  mql_pagamentos   jsonb   not null default '[]',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists sla_mql_forms (
  id          bigint generated always as identity primary key,
  vertical    text    not null,
  sort_order  int     not null default 0,
  pergunta    text    not null,
  opcoes      jsonb   not null default '[]',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists sla_mql_log (
  id          bigint generated always as identity primary key,
  ts          timestamptz not null default now(),
  user_name   text not null default '',
  user_email  text not null default '',
  vertical    text not null,
  section     text not null,
  action      text not null,
  entity      text not null,
  detail      text not null
);

-- ── Seed inicial (só insere se tabelas estiverem vazias) ──────────────────────

do $$
begin

  -- Rows (empreendimentos)
  if not exists (select 1 from sla_mql_rows limit 1) then
    insert into sla_mql_rows (vertical, nome, status, commercial_squad, mql_intencoes, mql_faixas, mql_pagamentos) values
      ('SZI','Itacaré Spot',true,'szi_01',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Vistas de Anitá II',true,'szi_01',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Jurerê Spot II',true,'szi_01',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Jurerê Spot III',true,'szi_01',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Marista 144 Spot',false,'szi_01',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 100.001 a R$ 200.000 em até 54 meses","R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Caraguá Spot',false,'szi_01',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Ponta das Canas Spot II',true,'szi_01',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Barra Grande Spot',true,'szi_02',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Natal Spot',true,'szi_02',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Bonito Spot II',true,'szi_02',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('SZI','Novo Campeche Spot II',true,'szi_02',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses"]',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto"]'),
      ('Marketplace','Marketplace',true,'',
        '["Investimento - renda com aluguel","Investimento - valorização do imóvel","Uso próprio - uso esporádico"]',
        '["R$ 30.001 a R$ 50.000","R$ 50.001 a R$ 80.000","R$ 80.001 a R$ 150.000","Acima de R$ 150.000"]',
        '[]'),
      ('Serviços','Seazone Serviços',true,'',
        '["Sim","Não","Parcialmente mobiliado"]',
        '["Disponível imediatamente","Alugado com contrato anual","Em reforma / preparação","Já opera por temporada"]',
        '["Sim","Não","Não, mas estou disposto a instalar caso seja necessário"]');
  end if;

  -- Formulários
  if not exists (select 1 from sla_mql_forms limit 1) then
    insert into sla_mql_forms (vertical, sort_order, pergunta, opcoes) values
      ('SZI',0,'Você procura investimento ou para uso próprio?',
        '["Investimento - renda com aluguel","Uso próprio - moradia","Uso próprio - uso esporádico","Investimento - valorização do imóvel"]'),
      ('SZI',1,'Qual o valor total que você pretende investir dentro de 54 meses?',
        '["R$ 50.000 a R$ 100.000 em até 54 meses","R$ 100.001 a R$ 200.000 em até 54 meses","R$ 200.001 a R$ 300.000 em até 54 meses","R$ 300.001 a R$ 400.000 em até 54 meses","Acima de R$ 400.000 em até 54 meses","À vista via PIX ou boleto"]'),
      ('SZI',2,'Qual a forma de pagamento?',
        '["À vista via PIX ou boleto","Parcelado via PIX ou boleto","Não tenho condição nessas opções"]'),
      ('Marketplace',0,'Você procura investimento ou para uso próprio?',
        '["Investimento - renda com aluguel","Uso próprio - moradia","Uso próprio - uso esporádico","Investimento - valorização do imóvel"]'),
      ('Marketplace',1,'Qual o valor de entrada que você tem hoje?',
        '["Até R$ 30.000","R$ 30.001 a R$ 50.000","R$ 50.001 a R$ 80.000","R$ 80.001 a R$ 150.000","Acima de R$ 150.000"]'),
      ('Serviços',0,'O imóvel para locação é mobiliado?',
        '["Sim","Não","Parcialmente mobiliado","Não tenho imóvel"]'),
      ('Serviços',1,'Qual a disponibilidade do imóvel para locação?',
        '["Disponível imediatamente","Alugado com contrato anual","Em reforma / preparação","Não está disponível","Já opera por temporada"]'),
      ('Serviços',2,'O imóvel possui ar condicionado?',
        '["Não, mas estou disposto a instalar caso seja necessário","Sim","Não"]');
  end if;

end;
$$;
