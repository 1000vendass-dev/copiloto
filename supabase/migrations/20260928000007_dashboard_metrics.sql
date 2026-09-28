-- Métricas do painel, calculadas no banco. SECURITY INVOKER: respeita o RLS do usuário.
create or replace function public.dashboard_metrics(p_team uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with bounds as (
    select date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as month_start,
           now() - interval '90 days' as d90, now() - interval '7 days' as d7
  )
  select jsonb_build_object(
    'funil', (select coalesce(jsonb_object_agg(stage, n), '{}') from (select stage, count(*) n from public.leads where team_id = p_team group by stage) s),
    'leads_novos_mes', (select count(*) from public.leads, bounds where team_id = p_team and created_at >= month_start),
    'vendas_mes', (select count(*) from public.leads, bounds where team_id = p_team and stage = 'venda' and closed_at >= month_start),
    'faturamento_mes', (select coalesce(sum(closed_value), 0) from public.leads, bounds where team_id = p_team and stage = 'venda' and closed_at >= month_start),
    'vendas_90d', (select count(*) from public.leads, bounds where team_id = p_team and stage = 'venda' and closed_at >= d90),
    'perdidos_90d', (select count(*) from public.leads, bounds where team_id = p_team and stage = 'perdido' and closed_at >= d90),
    'origens', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from (
        select coalesce(nullif(source, ''), 'Não informado') k, count(*) n from public.leads where team_id = p_team group by 1 order by 2 desc limit 8) o),
    'contatos_7d', (select count(*) from public.activities, bounds where team_id = p_team and occurred_at >= d7
                     and type in ('ligacao','whatsapp','email','visita','test_drive','follow_up')),
    'propostas_abertas', (select jsonb_build_object('n', count(*), 'valor', coalesce(sum(total), 0)) from public.proposals where team_id = p_team and status in ('rascunho','enviada')),
    'estoque', (select jsonb_build_object(
        'disponiveis', count(*) filter (where status = 'disponivel'),
        'reservados', count(*) filter (where status = 'reservado'),
        'vendidos_mes', count(*) filter (where status = 'vendido' and sold_at >= (select month_start from bounds)::date),
        'valor_disponivel', coalesce(sum(sale_price) filter (where status = 'disponivel'), 0),
        'idade_media_dias', coalesce(round(avg(current_date - entry_date) filter (where status = 'disponivel' and entry_date is not null)), 0),
        'parados_60d', count(*) filter (where status = 'disponivel' and entry_date <= current_date - 60),
        'sem_foto', count(*) filter (where status = 'disponivel' and not exists (select 1 from public.vehicle_images i where i.vehicle_id = v.id))
      ) from public.vehicles v where team_id = p_team),
    'carrocerias', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by n desc), '[]') from (
        select coalesce(body_type, 'outro') k, count(*) n from public.vehicles where team_id = p_team and status = 'disponivel' group by 1) b),
    'faixas_preco', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by o), '[]') from (
        select case when sale_price < 40000 then 'até 40 mil' when sale_price < 70000 then '40–70 mil' when sale_price < 100000 then '70–100 mil'
                    when sale_price < 150000 then '100–150 mil' else 'acima de 150 mil' end k,
               min(sale_price) o, count(*) n
        from public.vehicles where team_id = p_team and status = 'disponivel' and sale_price is not null group by 1) f),
    'lojas', (select coalesce(jsonb_agg(jsonb_build_object('k', k, 'n', n) order by k), '[]') from (
        select coalesce(store, '—') k, count(*) n from public.vehicles where team_id = p_team and status = 'disponivel' group by 1) l)
  );
$$;
revoke execute on function public.dashboard_metrics(uuid) from public, anon;
grant execute on function public.dashboard_metrics(uuid) to authenticated;
