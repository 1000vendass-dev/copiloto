-- Transcrição dos áudios do WhatsApp, só para a IA (o vendedor ouve o áudio).
alter table public.whatsapp_messages add column if not exists transcript text;
comment on column public.whatsapp_messages.transcript is 'Texto do áudio (Whisper na VPS). Usado só pela IA.';
comment on column public.whatsapp_messages.media_path is 'Arquivo de mídia no Storage do Supabase (bucket whatsapp-media).';

-- Áudios guardados pelo app (o WAHA apaga os arquivos dele em ~3 min).
-- Bucket privado: só o servidor (chave secreta) grava e lê; o navegador ouve pela rota do app, que confere a sessão.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('whatsapp-media', 'whatsapp-media', false, 16777216, array['audio/ogg', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav'])
on conflict (id) do nothing;
