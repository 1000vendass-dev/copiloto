-- Bucket de mídia do WhatsApp passa a aceitar fotos, figurinhas, vídeos curtos e PDF (antes só áudio).
update storage.buckets
set allowed_mime_types = array[
  'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'video/mp4', 'video/3gpp', 'application/pdf'
]
where id = 'whatsapp-media';
