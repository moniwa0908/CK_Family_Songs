# Ver.7.5.3 次の曲そのまま再生版

「次の曲へ」を押したときにYouTubeプレーヤーを作り直していた処理を廃止しました。

変更:
- 同じYouTube iframeを維持
- 「次の曲へ」でYouTubeの nextVideo コマンドを送信
- 続けて playVideo を送り再生継続
- 曲切替中は古い歌詞を消して、正しい動画ID確認後に新しい歌詞を表示
- ランダム連続再生のプレイリストは作り直さない

GitHubへ上書き:
- index.html
- app.js
- service-worker.js
