-- Tarefas passam a dizer QUEM da equipe comercial é dono delas (empresa de agentes):
-- voce = vendedor, ia = rotina da noite, follow_up / sdr / pos_venda = agentes da equipe do CSO.
-- A rotina da noite não mexe em tarefa que já é de um agente. Só amplia a lista; nada muda nas existentes.
alter table public.tasks drop constraint if exists tasks_source_check;
alter table public.tasks add constraint tasks_source_check
  check (source in ('voce', 'ia', 'follow_up', 'sdr', 'pos_venda'));
