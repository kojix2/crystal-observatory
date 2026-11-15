const entry = (ja, en, es, zh, fr, de, ru) => ({ ja, en, es, 'zh-CN': zh, fr, de, ru });

export const videoMessages = {
  'playback.recordVideo': entry(
    'ASTの再生を動画に保存',
    'Record AST playback',
    'Grabar la reproducción del AST',
    '录制 AST 回放',
    'Enregistrer la lecture de l’AST',
    'AST-Wiedergabe aufnehmen',
    'Записать воспроизведение AST',
  ),
  'playback.stopVideo': entry(
    '録画を終了して保存',
    'Stop and save video',
    'Detener y guardar el vídeo',
    '停止并保存视频',
    'Arrêter et enregistrer la vidéo',
    'Aufnahme beenden und Video speichern',
    'Остановить и сохранить видео',
  ),
  'playback.videoHint': entry(
    'ASTとビジターの吹き出しを動画にします。再生が止まると保存します。音声は含まれません。',
    'Records the AST and Visitor speech bubbles. The silent video is saved when playback stops.',
    'Graba el AST y los bocadillos del visitante. El vídeo sin sonido se guarda al detener la reproducción.',
    '录制 AST 和访问器对话气泡。回放停止时保存无声视频。',
    'Enregistre l’AST et les bulles du visiteur. La vidéo muette est sauvegardée à la fin de la lecture.',
    'Nimmt den AST und die Sprechblasen der Visitor auf. Beim Ende der Wiedergabe wird das Video ohne Ton gespeichert.',
    'Записывает AST и всплывающие реплики Visitor. Видео без звука сохранится после остановки воспроизведения.',
  ),
  'playback.videoSaved': entry(
    '再生動画を保存しました。',
    'Playback video saved.',
    'Vídeo de reproducción guardado.',
    '回放视频已保存。',
    'Vidéo de lecture enregistrée.',
    'Wiedergabevideo gespeichert.',
    'Видео воспроизведения сохранено.',
  ),
  'playback.videoError': entry(
    '録画を開始または保存できませんでした。',
    'Could not record or save the video.',
    'No se pudo grabar o guardar el vídeo.',
    '无法录制或保存视频。',
    'Impossible d’enregistrer ou de sauvegarder la vidéo.',
    'Das Video konnte nicht aufgenommen oder gespeichert werden.',
    'Не удалось записать или сохранить видео.',
  ),
};
