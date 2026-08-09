# CK Family Songs Ver.7.3.4 CSS復旧版

今回の修正:
- `style.css?v=733` をやめて `./style.css` の通常読み込みに戻しました。
- Service Workerのキャッシュ名を更新しました。
- CSS/JS/JSON取得失敗時に誤って `index.html` を返さないように修正しました。
- 万一CSS読み込みが遅れても、完全な未装飾画面にならない最低限の緊急スタイルを `index.html` に追加しました。
- C&K NEWS自動更新 (`news.json` + `.github/workflows/update-news.yml`) はそのまま維持しています。

GitHubへ上書き:
- index.html
- style.css
- service-worker.js

`news.json` と `.github/workflows/update-news.yml` は現在のものをそのまま残してください。
