# CK Family Songs Ver.7.4.3

「YouTubeプレーヤーを準備中…」のまま進まない問題を修正。

変更:
- YouTube IFrame APIの事前準備待ちを廃止
- 「連続再生」を押した操作から直接YouTube iframeを生成
- 準備完了を待たず、選ばれた曲をすぐ再生要求
- 次の曲へ、停止に対応
- YouTubeの終了通知を受け取れた場合は次曲へ自動移動

GitHubへ上書き:
- index.html
- app.js
- service-worker.js
