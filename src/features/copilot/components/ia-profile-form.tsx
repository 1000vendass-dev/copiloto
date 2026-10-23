"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { saveAiProfile } from "../actions";
import { AUTONOMY, PRESETS, PRESET_KEYS, TONES, type AiConfig, type PresetKey } from "../config";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hourLabel = (h: number) => (h === 24 ? "00h (meia-noite)" : `${String(h).padStart(2, "0")}h`);

const toNum = (s: string): number | null => {
  const n = Number(s.replace(/\D/g, ""));
  return s.trim() === "" || !Number.isFinite(n) ? null : n;
};

/** Identidade, autonomia, rotinas, metas e instruções da IA. Um botão salva tudo. */
export function IaProfileForm({ initial }: { initial: { autonomy: number; config: AiConfig } }) {
  const [autonomy, setAutonomy] = useState(initial.autonomy);
  const [cfg, setCfg] = useState<AiConfig>(initial.config);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const id = cfg.identity;
  const setId = (patch: Partial<AiConfig["identity"]>) => { setMsg(null); setCfg({ ...cfg, identity: { ...id, ...patch } }); };
  const setRoutines = (patch: Partial<AiConfig["routines"]>) => { setMsg(null); setCfg({ ...cfg, routines: { ...cfg.routines, ...patch } }); };

  const save = () => start(async () => {
    const r = await saveAiProfile({ autonomy, config: cfg });
    setMsg(r.ok ? { ok: true, text: "Salvo. A IA já usa as novas configurações." } : { ok: false, text: r.error ?? "Não foi possível salvar." });
  });

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <CardTitle>Identidade e personalidade</CardTitle>
        <div className="grid gap-3 sm:grid-cols-[1fr_5rem]">
          <Field label="Nome da sua IA" htmlFor="ia-name"><Input id="ia-name" value={id.name} maxLength={30} onChange={(e) => setId({ name: e.target.value })} /></Field>
          <Field label="Emoji" htmlFor="ia-emoji"><Input id="ia-emoji" value={id.emoji} maxLength={4} className="text-center text-xl" onChange={(e) => setId({ emoji: e.target.value })} /></Field>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-fg-muted">Personalidade</div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Personalidade">
            {PRESET_KEYS.map((k: PresetKey) => {
              const active = id.preset === k;
              return (
                <button key={k} type="button" role="radio" aria-checked={active} onClick={() => setId({ preset: k })}
                  className={cn("rounded-2xl border p-3 text-left transition-colors", active ? "border-brand bg-brand/10" : "border-border bg-muted hover:bg-muted-2")}>
                  <span className={cn("block text-sm font-semibold", active && "text-brand")}>{PRESETS[k].label}</span>
                  <span className="block text-xs text-fg-muted">{PRESETS[k].hint}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tom" htmlFor="ia-tone">
            <Select id="ia-tone" value={id.tone} onChange={(e) => setId({ tone: e.target.value as AiConfig["identity"]["tone"] })}>
              {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Como te chamar" htmlFor="ia-address" hint="Vazio = seu primeiro nome">
            <Input id="ia-address" value={id.address} maxLength={30} placeholder="Ex.: chefe, Wanderson" onChange={(e) => setId({ address: e.target.value })} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={id.emojis} onChange={(e) => setId({ emojis: e.target.checked })} /> Usar emojis nas mensagens</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={id.offTopic} onChange={(e) => setId({ offTopic: e.target.checked })} /> Pode conversar sobre assuntos fora de vendas</label>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Autonomia</CardTitle>
        <div className="space-y-2" role="radiogroup" aria-label="Autonomia">
          {AUTONOMY.map((a) => {
            const active = autonomy === a.value;
            return (
              <button key={a.value} type="button" role="radio" aria-checked={active}
                onClick={() => { setMsg(null); setAutonomy(a.value); }}
                className={cn("flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors disabled:opacity-50",
                  active ? "border-brand bg-brand/10" : "border-border bg-muted hover:bg-muted-2")}>
                <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", active ? "border-brand bg-brand text-white" : "border-border")}>
                  {active ? <Check className="h-3 w-3" aria-hidden /> : null}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{a.label}</span>
                  <span className="block text-xs text-fg-muted">{a.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-fg-muted">Em qualquer nível, a IA nunca envia mensagem para cliente e nunca muda a etapa do funil sozinha. Isso é fixo.</p>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Rotinas e horários</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="A IA trabalha a partir de" htmlFor="w-from">
            <Select id="w-from" value={cfg.routines.window.from} onChange={(e) => setRoutines({ window: { ...cfg.routines.window, from: Number(e.target.value) } })}>
              {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </Select>
          </Field>
          <Field label="até" htmlFor="w-to">
            <Select id="w-to" value={cfg.routines.window.to} onChange={(e) => setRoutines({ window: { ...cfg.routines.window, to: Number(e.target.value) } })}>
              {[...HOURS.slice(1), 24].map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-fg-muted">Fora dessa janela a IA não trabalha e não gasta nada. O relógio confere de hora em hora.</p>
        <Field label="Follow-up: reativar o cliente depois de" htmlFor="fu-horas"
          hint="Só no Nível 2. Conta a partir da sua última mensagem sem resposta. O Follow-up roda de hora em hora, das 7h às 21h, e para depois de 3 mensagens sem resposta.">
          <Select id="fu-horas" value={cfg.routines.followup.semRespostaHoras}
            onChange={(e) => setRoutines({ followup: { semRespostaHoras: Number(e.target.value) } })}>
            {[2, 3, 4, 6, 8, 12, 24, 48, 72].map((h) => <option key={h} value={h}>{h < 24 ? `${h} horas sem resposta` : `${h / 24} dia${h === 24 ? "" : "s"} sem resposta`}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={cfg.routines.nightly.enabled} onChange={(e) => setRoutines({ nightly: { ...cfg.routines.nightly, enabled: e.target.checked } })} />
          Rotina da noite (resumos, memória, tarefas e relatório do dia)
        </label>
        {cfg.routines.nightly.enabled ? (
          <Field label="Rodar a partir de" htmlFor="n-hour" hint="Roda na primeira checagem depois desse horário.">
            <Select id="n-hour" value={cfg.routines.nightly.hour} onChange={(e) => setRoutines({ nightly: { ...cfg.routines.nightly, hour: Number(e.target.value) } })}>
              {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </Select>
          </Field>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <CardTitle>Metas e instruções</CardTitle>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendas por mês" htmlFor="g-sales">
            <Input id="g-sales" inputMode="numeric" value={cfg.goals.salesPerMonth ?? ""} placeholder="Ex.: 25"
              onChange={(e) => { setMsg(null); setCfg({ ...cfg, goals: { ...cfg.goals, salesPerMonth: toNum(e.target.value) } }); }} />
          </Field>
          <Field label="Visitas por semana" htmlFor="g-visits">
            <Input id="g-visits" inputMode="numeric" value={cfg.goals.visitsPerWeek ?? ""} placeholder="Ex.: 10"
              onChange={(e) => { setMsg(null); setCfg({ ...cfg, goals: { ...cfg.goals, visitsPerWeek: toNum(e.target.value) } }); }} />
          </Field>
        </div>
        <Field label="Suas instruções para a IA" htmlFor="ia-instr" hint="Ela segue sempre, desde que não contrarie as regras fixas.">
          <Textarea id="ia-instr" rows={4} value={cfg.instructions} maxLength={2000} placeholder="Ex.: Sempre puxe o cliente para uma visita. Seja direto e me cobre quando eu deixar cliente quente sem resposta."
            onChange={(e) => { setMsg(null); setCfg({ ...cfg, instructions: e.target.value }); }} />
        </Field>
      </Card>

      {msg ? <Alert kind={msg.ok ? "success" : "error"}>{msg.text}</Alert> : null}
      <Button size="lg" className="w-full" onClick={save} disabled={pending}>{pending ? "Salvando…" : "Salvar configurações da IA"}</Button>
    </div>
  );
}
